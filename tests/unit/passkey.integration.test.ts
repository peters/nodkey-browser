// @vitest-environment node
/**
 * The background's passkey path against nodkey-cli's fake phone, which holds passkeys and signs
 * with ES256 as the app does: create a passkey, sign in with it, and check the signature as a
 * website's server does.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { createHash, createHmac, createPublicKey, verify } from 'node:crypto'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { useKeyStore } from '../../src/background/keys'
import type { PasskeyCreateResult, PasskeyGetResult } from '../../src/models/passkey'
import { PasskeyError } from '../../src/models/passkey'
import { installFakeChrome, loadWasm, memoryKeyStore } from './fake-chrome'

const BIN = 'target/debug/nodkey-fake-relay'
let relay: ChildProcess | undefined
let base = ''

beforeAll(async () => {
  if (!existsSync(BIN)) throw new Error(`${BIN} is missing: run cargo build -p fake-relay`)
  const child = spawn(BIN, ['127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  relay = child
  base = await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      const m = /listening on (\S+)/.exec(chunk.toString())
      if (m?.[1]) resolve(m[1])
    })
    child.on('exit', () => {
      reject(new Error('fake relay exited'))
    })
  })
  installFakeChrome()
  loadWasm()
  useKeyStore(memoryKeyStore())
  const store = await import('../../src/background/store')
  await store.setSettings({ relay: base })
  const agent = await import('../../src/background/agent')
  const { code } = await agent.startPairing('Test browser')
  const phone = await agent.finishPairing(code)
  if (!phone) throw new Error('no pairing')
  await agent.rememberPhone(phone)
})

afterAll(() => {
  relay?.kill()
})

const buf = (s: string) => Buffer.from(s, 'base64url')
const challenge = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')

function sender(url: string): chrome.runtime.MessageSender {
  return { url, origin: new URL(url).origin, frameId: 0, tab: { id: 7, url } as chrome.tabs.Tab }
}

/** The check a website's server does on a sign-in. */
function verifies(result: PasskeyGetResult, spki: string): boolean {
  const key = createPublicKey({ key: buf(spki), format: 'der', type: 'spki' })
  const hash = createHash('sha256').update(buf(result.clientDataJSON)).digest()
  const signed = Buffer.concat([buf(result.authenticatorData), hash])
  return verify('sha256', signed, { key, dsaEncoding: 'der' }, buf(result.signature))
}

describe('passkeys against the fake phone', () => {
  it(
    'creates a passkey, signs in with it, and refuses to make it twice',
    { timeout: 60_000 },
    async () => {
      const { passkey } = await import('../../src/background/passkeys')
      const page = sender('https://login.example.com/account')
      const live = new AbortController().signal

      const made = (await passkey(
        {
          call: {
            op: 'create',
            challenge: challenge(),
            rp: { id: 'example.com', name: 'Example' },
            user: { id: 'dXNlci0x', name: 'alex@example.com', displayName: 'Alex' },
            algorithms: [-7, -257],
            residentKey: 'required',
            userVerification: 'required',
          },
          sameOriginAncestors: true,
        },
        page,
        live,
      )) as PasskeyCreateResult
      expect(made.op).toBe('create')
      expect(made.publicKeyAlgorithm).toBe(-7)
      const held = (await (await fetch(`${base}/_fake/passkeys`)).json()) as {
        rp_id: string
        credential_id: string
        public_key: string
      }[]
      const mine = held.find((p) => p.credential_id === made.credentialId)
      expect(mine?.rp_id).toBe('example.com')
      expect(mine?.public_key).toBe(made.publicKey)

      const signed = (await passkey(
        {
          call: {
            op: 'get',
            challenge: challenge(),
            rpId: 'example.com',
            allowCredentials: [made.credentialId],
            userVerification: 'required',
          },
          sameOriginAncestors: true,
        },
        page,
        live,
      )) as PasskeyGetResult
      expect(signed.credentialId).toBe(made.credentialId)
      expect(signed.userHandle).toBe('dXNlci0x')
      expect(verifies(signed, made.publicKey)).toBe(true)
      const cdj = JSON.parse(buf(signed.clientDataJSON).toString('utf8')) as { origin: string }
      expect(cdj.origin).toBe('https://login.example.com')

      // The phone refuses a second passkey for the same account: InvalidStateError.
      const again = passkey(
        {
          call: {
            op: 'create',
            challenge: challenge(),
            rp: { id: 'example.com', name: 'Example' },
            user: { id: 'dXNlci0x', name: 'alex@example.com', displayName: 'Alex' },
            algorithms: [-7],
            excludeCredentials: [made.credentialId],
          },
          sameOriginAncestors: true,
        },
        page,
        live,
      )
      await expect(again).rejects.toMatchObject({ domName: 'InvalidStateError' })

      // No passkey for another site: NotAllowedError.
      await expect(
        passkey(
          { call: { op: 'get', challenge: challenge() }, sameOriginAncestors: true },
          sender('https://other.example.org/'),
          live,
        ),
      ).rejects.toBeInstanceOf(PasskeyError)

      // The phone's own test passkey for webauthn.io, found without an allow list.
      const test = (await passkey(
        { call: { op: 'get', challenge: challenge() }, sameOriginAncestors: true },
        sender('https://webauthn.io/'),
        live,
      )) as PasskeyGetResult
      const testKey = held.find((p) => p.rp_id === 'webauthn.io')
      expect(test.credentialId).toBe(testKey?.credential_id)
      expect(verifies(test, testKey?.public_key ?? '')).toBe(true)
    },
  )

  it('passes the PRF extension through and returns its outputs', { timeout: 60_000 }, async () => {
    const { passkey } = await import('../../src/background/passkeys')
    const page = sender('https://vault.example.com/unlock')
    const live = new AbortController().signal
    // nodkey-proto's vector: input "nodkey prf test" with the fake phone's fixed credRandom.
    const input = 'bm9ka2V5IHByZiB0ZXN0'
    const output = 'JPl2H-0JODODdNk542gVtl9BvaIZcG_4J8lQ4HIuMfE'
    const credRandom = buf('NFzGvEstbwdMX6LmiQNdVFvEGvgPQOTVmPrqMvyGqP4')
    const prf = (b64u: string) => {
      const salt = createHash('sha256')
        .update(Buffer.concat([Buffer.from('WebAuthn PRF\0'), buf(b64u)]))
        .digest()
      return createHmac('sha256', credRandom).update(salt).digest('base64url')
    }
    expect(prf(input)).toBe(output)

    const made = (await passkey(
      {
        call: {
          op: 'create',
          challenge: challenge(),
          rp: { id: 'vault.example.com', name: 'Vault' },
          user: { id: 'dXNlci0y', name: 'alex@example.com', displayName: 'Alex' },
          algorithms: [-7],
          prf: { eval: { first: input } },
        },
        sameOriginAncestors: true,
      },
      page,
      live,
    )) as PasskeyCreateResult
    expect(made.prf).toEqual({ enabled: true, results: { first: output } })

    const second = 'AAEC'
    const signed = (await passkey(
      {
        call: {
          op: 'get',
          challenge: challenge(),
          allowCredentials: [made.credentialId],
          prf: {
            eval: { first: 'ZmFsbGJhY2s' },
            evalByCredential: { [made.credentialId]: { first: input, second } },
          },
        },
        sameOriginAncestors: true,
      },
      page,
      live,
    )) as PasskeyGetResult
    // The passkey's own entry wins over eval.
    expect(signed.prf).toEqual({ results: { first: output, second: prf(second) } })
    expect(verifies(signed, made.publicKey)).toBe(true)
    const sent = (await (await fetch(`${base}/_fake/seen`)).json()) as {
      request: { passkey: Record<string, unknown> }
    }[]
    expect(sent.at(-1)?.request.passkey.prf).toEqual({
      eval: { first: 'ZmFsbGJhY2s' },
      eval_by_credential: { [made.credentialId]: { first: input, second } },
    })

    // prf: {} without inputs: nothing to ask for, and an empty result as a browser gives.
    const plain = (await passkey(
      {
        call: {
          op: 'get',
          challenge: challenge(),
          allowCredentials: [made.credentialId],
          prf: {},
        },
        sameOriginAncestors: true,
      },
      page,
      live,
    )) as PasskeyGetResult
    expect(plain.prf).toEqual({})

    // The phone's test passkey for webauthn.io was made before PRF: Nodkey asks again without
    // PRF, and the page gets the sign-in without PRF results.
    const seen = async () =>
      (await (await fetch(`${base}/_fake/seen`)).json()) as {
        request: { passkey: Record<string, unknown> }
      }[]
    const before = (await seen()).length
    const old = (await passkey(
      {
        call: { op: 'get', challenge: challenge(), prf: { eval: { first: input } } },
        sameOriginAncestors: true,
      },
      sender('https://webauthn.io/'),
      live,
    )) as PasskeyGetResult
    expect(old.prf).toEqual({})
    const after = await seen()
    expect(after.length - before).toBe(2)
    expect(after.at(-2)?.request.passkey.prf).toEqual({ eval: { first: input } })
    expect(after.at(-1)?.request.passkey.prf).toBeUndefined()
  })
})
