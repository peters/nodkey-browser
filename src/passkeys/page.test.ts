/**
 * The page script in a page: the browser's WebAuthn classes are stand-ins (jsdom has none), the
 * bridge is played by listeners on the page events.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PAGE_CANCEL, PAGE_REPLY, PAGE_REQUEST, type PasskeyReply } from '../models/passkey'
import { encode } from './b64u'

class FakeContainer {
  get(): Promise<string> {
    return Promise.resolve('native get')
  }
  create(): Promise<string> {
    return Promise.resolve('native create')
  }
}
class FakePublicKeyCredential {
  readonly type = 'public-key'
  static isUserVerifyingPlatformAuthenticatorAvailable() {
    return Promise.resolve(false)
  }
  static isConditionalMediationAvailable() {
    return Promise.resolve(true)
  }
  static getClientCapabilities() {
    return Promise.resolve({ conditionalGet: true, hybridTransport: true })
  }
}
class FakeAssertion {
  readonly kind = 'assertion'
}
class FakeAttestation {
  readonly kind = 'attestation'
}

const requests: { id: string; call: Record<string, unknown> }[] = []
const cancels: string[] = []
let container: FakeContainer

beforeAll(async () => {
  Object.assign(globalThis, {
    CredentialsContainer: FakeContainer,
    PublicKeyCredential: FakePublicKeyCredential,
    AuthenticatorAssertionResponse: FakeAssertion,
    AuthenticatorAttestationResponse: FakeAttestation,
  })
  window.addEventListener(PAGE_REQUEST, (e) => {
    requests.push(JSON.parse(String((e as CustomEvent).detail)) as (typeof requests)[number])
  })
  window.addEventListener(PAGE_CANCEL, (e) => {
    cancels.push((JSON.parse(String((e as CustomEvent).detail)) as { id: string }).id)
  })
  await import('./page')
  container = new FakeContainer()
})

function answer(reply: PasskeyReply): void {
  const last = requests.at(-1)
  if (!last) throw new Error('no request')
  window.dispatchEvent(
    new CustomEvent(PAGE_REPLY, { detail: JSON.stringify({ id: last.id, reply }) }),
  )
}

const b = (s: string) => encode(new TextEncoder().encode(s))
const challenge = new Uint8Array(32).fill(7)

function creds(): CredentialsContainer {
  return container as unknown as CredentialsContainer
}

describe('the page script', () => {
  it('leaves requests without publicKey to the browser', async () => {
    await expect(creds().get({ password: true } as CredentialRequestOptions)).resolves.toBe(
      'native get',
    )
    await expect(creds().create({})).resolves.toBe('native create')
    expect(requests).toHaveLength(0)
  })

  it('reports a platform authenticator and no conditional mediation', async () => {
    await expect(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(
      true,
    )
    await expect(PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false)
    const caps = await (
      PublicKeyCredential as unknown as { getClientCapabilities(): Promise<object> }
    ).getClientCapabilities()
    expect(caps).toEqual({
      conditionalGet: false,
      conditionalCreate: false,
      hybridTransport: true,
      passkeyPlatformAuthenticator: true,
      userVerifyingPlatformAuthenticator: true,
    })
  })

  it('never sends a conditional request; the signal ends it', async () => {
    const controller = new AbortController()
    const pending = creds().get({
      mediation: 'conditional',
      signal: controller.signal,
      publicKey: { challenge },
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(requests).toHaveLength(0)
    controller.abort(new DOMException('stop', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('sends a get and builds the credential from the answer', async () => {
    const pending = creds().get({
      publicKey: {
        challenge,
        rpId: 'example.com',
        allowCredentials: [{ type: 'public-key', id: new Uint8Array([1, 2, 3]) }],
        userVerification: 'required',
      },
    })
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1)
    })
    expect(requests[0]?.call).toEqual({
      op: 'get',
      challenge: encode(challenge),
      rpId: 'example.com',
      allowCredentials: ['AQID'],
      userVerification: 'required',
    })
    answer({
      ok: true,
      result: {
        op: 'get',
        clientDataJSON: b('{"type":"webauthn.get"}'),
        credentialId: 'AQID',
        authenticatorData: b('auth'),
        signature: b('sig'),
        userHandle: b('user-1'),
      },
    })
    const cred = (await pending) as PublicKeyCredential
    expect(cred).toBeInstanceOf(FakePublicKeyCredential)
    expect(cred.id).toBe('AQID')
    expect(cred.type).toBe('public-key')
    expect(cred.authenticatorAttachment).toBe('platform')
    expect(new Uint8Array(cred.rawId)).toEqual(new Uint8Array([1, 2, 3]))
    expect(cred.getClientExtensionResults()).toEqual({})
    const response = cred.response as AuthenticatorAssertionResponse
    expect(response).toBeInstanceOf(FakeAssertion)
    expect(new TextDecoder().decode(response.signature)).toBe('sig')
    expect(new TextDecoder().decode(response.userHandle ?? new ArrayBuffer(0))).toBe('user-1')
    expect((cred as unknown as { toJSON(): unknown }).toJSON()).toEqual({
      id: 'AQID',
      rawId: 'AQID',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: b('{"type":"webauthn.get"}'),
        authenticatorData: b('auth'),
        signature: b('sig'),
        userHandle: b('user-1'),
      },
      clientExtensionResults: {},
    })
  })

  it('sends a create and builds the attestation response', async () => {
    const pending = creds().create({
      publicKey: {
        challenge,
        rp: { name: 'Example' },
        user: { id: new TextEncoder().encode('user-1'), name: 'alex', displayName: 'Alex' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -8 },
          { type: 'public-key', alg: -7 },
        ],
        authenticatorSelection: { requireResidentKey: true },
      },
    })
    await vi.waitFor(() => {
      expect(requests).toHaveLength(2)
    })
    expect(requests[1]?.call).toMatchObject({
      op: 'create',
      rp: { name: 'Example' },
      user: { id: b('user-1'), name: 'alex', displayName: 'Alex' },
      algorithms: [-8, -7],
      excludeCredentials: [],
      residentKey: 'required',
      userVerification: 'preferred',
    })
    answer({
      ok: true,
      result: {
        op: 'create',
        clientDataJSON: b('{}'),
        credentialId: 'AQID',
        attestationObject: b('att'),
        authenticatorData: b('auth'),
        publicKey: b('spki'),
        publicKeyAlgorithm: -7,
      },
    })
    const cred = (await pending) as PublicKeyCredential
    const response = cred.response as AuthenticatorAttestationResponse
    expect(response).toBeInstanceOf(FakeAttestation)
    expect(new TextDecoder().decode(response.attestationObject)).toBe('att')
    expect(new TextDecoder().decode(response.getAuthenticatorData())).toBe('auth')
    expect(new TextDecoder().decode(response.getPublicKey() ?? new ArrayBuffer(0))).toBe('spki')
    expect(response.getPublicKeyAlgorithm()).toBe(-7)
    expect(response.getTransports()).toEqual(['hybrid', 'internal'])
    // @github/webauthn-json replaces toJSON on the credential (this module is strict code).
    const page = cred as unknown as { toJSON: () => unknown }
    page.toJSON = () => 'from the page'
    expect(page.toJSON()).toBe('from the page')
    expect(() => {
      ;(cred as unknown as { id: string }).id = 'other'
    }).toThrow(TypeError)
  })

  it('rejects with the DOMException the background names', async () => {
    const pending = creds().create({
      publicKey: {
        challenge,
        rp: { name: 'Example' },
        user: { id: new Uint8Array([1]), name: 'alex', displayName: 'Alex' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    })
    await vi.waitFor(() => {
      expect(requests).toHaveLength(3)
    })
    answer({ ok: false, name: 'InvalidStateError', message: 'exists' })
    await expect(pending).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'InvalidStateError',
    )
  })

  it('cancels when the signal aborts', async () => {
    const controller = new AbortController()
    const pending = creds().get({ signal: controller.signal, publicKey: { challenge } })
    await vi.waitFor(() => {
      expect(requests).toHaveLength(4)
    })
    controller.abort(new DOMException('gone', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancels).toEqual([requests[3]?.id])
  })

  it('rejects bad options with a TypeError before asking', async () => {
    await expect(
      creds().get({ publicKey: { challenge: 'text' as unknown as BufferSource } }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(requests).toHaveLength(4)
  })

  it('passes PRF inputs and returns the outputs as ArrayBuffers', async () => {
    const before = requests.length
    const pending = creds().get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: new Uint8Array([1, 2, 3]) }],
        extensions: {
          prf: {
            eval: { first: new Uint8Array([9]) },
            evalByCredential: { AQID: { first: new Uint8Array([1]), second: new ArrayBuffer(2) } },
          },
        },
      },
    })
    await vi.waitFor(() => {
      expect(requests).toHaveLength(before + 1)
    })
    expect(requests.at(-1)?.call.prf).toEqual({
      eval: { first: 'CQ' },
      evalByCredential: { AQID: { first: 'AQ', second: 'AAA' } },
    })
    const first = encode(new Uint8Array(32).fill(5))
    answer({
      ok: true,
      result: {
        op: 'get',
        clientDataJSON: b('{"type":"webauthn.get"}'),
        credentialId: 'AQID',
        authenticatorData: b('auth'),
        signature: b('sig'),
        prf: { results: { first } },
      },
    })
    const cred = (await pending) as PublicKeyCredential
    const ext = cred.getClientExtensionResults() as { prf: { results: { first: ArrayBuffer } } }
    expect(ext.prf.results.first).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(ext.prf.results.first)).toEqual(new Uint8Array(32).fill(5))
    // A new object each time: the page cannot change what the next call gives.
    expect(cred.getClientExtensionResults()).not.toBe(ext)
    const json = (cred as unknown as { toJSON(): { clientExtensionResults: unknown } }).toJSON()
    expect(json.clientExtensionResults).toEqual({ prf: { results: { first } } })
  })
})
