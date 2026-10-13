// @vitest-environment node
/** The background's passkey rules with a stand-in phone (`ask`), so no relay is needed. */

import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ask, Outcome } from './agent'
import type { Answer, Phone } from '../models/protocol'
import { installFakeChrome, loadWasm } from '../../tests/unit/fake-chrome'
import { decode, encode } from '../passkeys/b64u'

const asked: Ask[] = []
let next: (a: Ask, signal?: AbortSignal) => Promise<Answer | null>

vi.mock('./agent', () => ({
  ask: async (a: Ask, phone: Phone, signal?: AbortSignal): Promise<Outcome> => {
    asked.push(a)
    const answer = await next(a, signal)
    return answer ? { answer, phone } : { answer: null, phone }
  },
}))
vi.mock('./actions', () => ({
  info: { browser: 'Firefox', system: 'Linux' },
  client: () => ({ app: 'Nodkey for Firefox', app_version: '0', os: 'Linux' }),
  publish: vi.fn(() => Promise.resolve()),
}))

const { passkey } = await import('./passkeys')
const store = await import('./store')
const { PasskeyError } = await import('../models/passkey')

const CHALLENGE = encode(new Uint8Array(32).fill(9))
const KEY = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const SPKI = encode(KEY.publicKey.export({ format: 'der', type: 'spki' }))
const SIGNATURE = encode(sign('sha256', Buffer.from('signed'), KEY.privateKey))
const PHONE: Phone = {
  phone_id: 'cGhvbmU',
  name: 'Test iPhone',
  sign: 'AA',
  kem: 'AA',
  check: '000 000',
  scope: 'all',
  paired_at: 1,
}

function authData(rpId: string, flags = 0x1d, credentialId?: Uint8Array): string {
  const hash = createHash('sha256').update(rpId).digest()
  const head = [...hash, flags, 0, 0, 0, 1]
  if (!credentialId) return encode(Uint8Array.from(head))
  const attested = [...new Array<number>(16).fill(0), 0, credentialId.length, ...credentialId]
  return encode(Uint8Array.from([...head, ...attested]))
}

function sender(url: string, frameId = 0, top = url): chrome.runtime.MessageSender {
  return { url, origin: new URL(url).origin, frameId, tab: { id: 1, url: top } as chrome.tabs.Tab }
}

const get = (rpId?: string) => ({
  call: { op: 'get', challenge: CHALLENGE, ...(rpId ? { rpId } : {}) },
  sameOriginAncestors: true,
})

function create(algorithms = [-7]) {
  return {
    call: {
      op: 'create',
      challenge: CHALLENGE,
      rp: { name: 'Example' },
      user: { id: 'dXNlcg', name: 'alex', displayName: 'Alex' },
      algorithms,
    },
    sameOriginAncestors: true,
  }
}

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof PasskeyError) return e.domName
    throw e
  }
  return 'resolved'
}

const live = () => new AbortController().signal

beforeEach(async () => {
  installFakeChrome()
  loadWasm()
  await store.setPhones([PHONE])
  asked.length = 0
  next = () => Promise.resolve(null)
})

describe('passkeys in the background', () => {
  it('signs in: the origin comes from the sender, the phone signs', async () => {
    next = () =>
      Promise.resolve({
        v: 1,
        request_id: 'r',
        decision: 'approved',
        passkey: {
          credential_id: 'AQID',
          authenticator_data: authData('example.com'),
          signature: SIGNATURE,
          user_handle: 'dXNlcg',
        },
      })
    const out = await passkey(get('example.com'), sender('https://login.example.com/x'), live())
    expect(out).toMatchObject({ op: 'get', credentialId: 'AQID', userHandle: 'dXNlcg' })
    const request = asked[0]
    expect(request?.kind).toBe('passkey')
    expect(request?.site).toBe('example.com')
    expect(request?.passkey).toMatchObject({ op: 'get', rp_id: 'example.com' })
    const cdj = JSON.parse(
      new TextDecoder().decode(decode(String(request?.passkey?.client_data_json))),
    ) as unknown
    expect(cdj).toEqual({
      type: 'webauthn.get',
      challenge: CHALLENGE,
      origin: 'https://login.example.com',
      crossOrigin: false,
    })
    expect(out.clientDataJSON).toBe(request?.passkey?.client_data_json)
  })

  it('refuses unsafe callers without asking the phone', async () => {
    const cases: [ReturnType<typeof get>, chrome.runtime.MessageSender, string][] = [
      [get(), sender('http://example.com/'), 'SecurityError'],
      [get('other.com'), sender('https://example.com/'), 'SecurityError'],
      [get(), sender('https://ads.test/', 2, 'https://example.com/'), 'SecurityError'],
      [
        { ...get(), sameOriginAncestors: false },
        sender('https://example.com/f', 2, 'https://example.com/'),
        'SecurityError',
      ],
      [
        get(),
        { url: 'about:blank', frameId: 0, tab: { id: 1 } as chrome.tabs.Tab },
        'SecurityError',
      ],
    ]
    for (const [msg, from, name] of cases) {
      expect(await refusal(passkey(msg, from, live())), from.url).toBe(name)
    }
    expect(await refusal(passkey(create([-257]), sender('https://example.com/'), live()))).toBe(
      'NotSupportedError',
    )
    expect(asked).toHaveLength(0)
  })

  it('allows a same-origin frame and http://localhost', async () => {
    const frame = sender('https://example.com/frame', 4, 'https://example.com/')
    expect(await refusal(passkey(get(), frame, live()))).toBe('NotAllowedError')
    expect(await refusal(passkey(get(), sender('http://localhost:8080/'), live()))).toBe(
      'NotAllowedError',
    )
    expect(asked).toHaveLength(2)
  })

  it('creates a passkey and checks its data', async () => {
    const id = new Uint8Array([5, 6, 7])
    next = () =>
      Promise.resolve({
        v: 1,
        request_id: 'r',
        decision: 'approved',
        passkey: {
          credential_id: encode(id),
          attestation_object: 'o2Nm',
          authenticator_data: authData('example.com', 0x5d, id),
          public_key: SPKI,
          public_key_algorithm: -7,
        },
      })
    const out = await passkey(create([-8, -7]), sender('https://example.com/'), live())
    expect(out).toMatchObject({ op: 'create', credentialId: 'BQYH', publicKeyAlgorithm: -7 })
    expect(asked[0]?.passkey).toMatchObject({
      op: 'create',
      rp_id: 'example.com',
      rp_name: 'Example',
      user: { id: 'dXNlcg', name: 'alex', display_name: 'Alex' },
      algorithms: [-8, -7],
      exclude_credentials: [],
      resident_key: 'discouraged',
    })
  })

  it('refuses an answer for another site', async () => {
    next = () =>
      Promise.resolve({
        v: 1,
        request_id: 'r',
        decision: 'approved',
        passkey: {
          credential_id: 'AQID',
          authenticator_data: authData('evil.test'),
          signature: SIGNATURE,
        },
      })
    expect(await refusal(passkey(get(), sender('https://example.com/'), live()))).toBe(
      'NotAllowedError',
    )
  })

  it('maps the refusals of the phone', async () => {
    const deny = (error?: string) => () =>
      Promise.resolve<Answer>({
        v: 1,
        request_id: 'r',
        decision: 'denied',
        ...(error ? { error } : {}),
      })
    const page = sender('https://example.com/')
    next = deny('excluded')
    expect(await refusal(passkey(create(), page, live()))).toBe('InvalidStateError')
    next = deny('no_passkey')
    expect(await refusal(passkey(get(), page, live()))).toBe('NotAllowedError')
    next = deny()
    expect(await refusal(passkey(get(), page, live()))).toBe('NotAllowedError')
    next = () => Promise.resolve(null)
    expect(await refusal(passkey(get(), page, live()))).toBe('NotAllowedError')
  })

  it('stops waiting when the page aborts', async () => {
    const controller = new AbortController()
    next = () => new Promise(() => {})
    const pending = passkey(get(), sender('https://example.com/'), controller.signal)
    await vi.waitFor(() => {
      expect(asked).toHaveLength(1)
    })
    controller.abort()
    expect(await refusal(pending)).toBe('AbortError')
  })

  it('does nothing while the bridge is off', async () => {
    await store.setSettings({ passkeys: false })
    expect(await refusal(passkey(get(), sender('https://example.com/'), live()))).toBe(
      'NotAllowedError',
    )
    expect(asked).toHaveLength(0)
  })
})
