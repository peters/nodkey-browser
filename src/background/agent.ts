/**
 * What the extension does as a Nodkey agent: pair with the phone, send one request and wait for
 * the answer. The protocol steps run in the WebAssembly module (nodkey-proto from nodkey-cli);
 * the private-key steps run in WebCrypto (`keys.ts`); the network calls in `relay.ts`.
 */

import {
  b64u_decode,
  finish_pairing,
  open_answer,
  open_grant,
  pairing_check_to_sign,
  random_id,
  request_to_sign,
  seal_attachment,
  seal_signed_request,
} from '../wasm/nodkey.js'
import {
  type Answer,
  type Kind,
  type Phone,
  type SealedBox,
  type SealedRequest,
  type ToSign,
  parseGrant,
  parseRead,
  parseSealedRequest,
  parseToSign,
} from '../models/protocol'
import * as keys from './keys'
import { Relay, RelayError, pollUntil } from './relay'
import * as store from './store'

/** How long a request waits for the person (protocol: 120 s). */
export const REQUEST_MS = 120_000
/** How long to wait for an answer: the envelope's `ttl` (an `sms_code` request), else 120 s. */
export function waitMs(ttl: number | undefined): number {
  return ttl === undefined ? REQUEST_MS : ttl * 1000
}
/** How long pairing waits for the phone to claim the code (protocol: 300 s). */
export const PAIRING_MS = 300_000

export interface Picture {
  type: 'image/png' | 'image/jpeg' | 'image/gif'
  bytes: Uint8Array
  caption: string
}

export interface ClientInfo {
  app: string
  app_version: string
  os: string
}

/** The relay client for this agent with the current settings. */
export async function relay(agentId: string): Promise<Relay> {
  return new Relay((await store.settings()).relay, agentId)
}

/** Keeps the background alive while it waits on the network (Chrome stops idle workers). */
async function keepAlive<T>(work: Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    void chrome.runtime.getPlatformInfo()
  }, 20_000)
  try {
    return await work
  } finally {
    clearInterval(timer)
  }
}

/** Starts pairing: makes keys on first use and returns the code to type on the phone. */
export async function startPairing(name: string): Promise<{ code: string; expires: number }> {
  let agent = await store.agent()
  if (!agent || !(await keys.exists())) {
    await keys.generate()
    agent = { agent_id: random_id(), name }
  }
  agent = { ...agent, name }
  await store.setAgent(agent)
  const pub = await keys.publicKeys()
  const r = await relay(agent.agent_id)
  return r.startPairing({ agent_id: agent.agent_id, name, sign: pub.sign, kem: pub.kem })
}

/**
 * Why a pairing stopped without a phone: Nodkey on the iPhone is too old for the pairing with the
 * commitment (`old_app`), or the pairing check did not come or did not fit (`check`).
 */
export class PairingError extends Error {
  override name = 'PairingError'
  constructor(readonly code: 'old_app' | 'check') {
    super(code)
  }
}

/** An answer without a valid signature from a phone that signs: never used. */
export class NotSignedError extends Error {
  override name = 'NotSignedError'
  constructor() {
    super('the answer is not signed by the phone')
  }
}

/** Signs a request in WebCrypto and seals it to the phone. */
async function sealSigned(t: ToSign, agentId: string, phoneKem: string): Promise<SealedRequest> {
  const signature = await keys.signBytes(b64u_decode(t.message))
  return parseSealedRequest(seal_signed_request(t.body, signature, agentId, phoneKem))
}

/** Opens and checks the phone's answer; `not_signed` becomes a [`NotSignedError`]. */
async function openAnswer(
  box: SealedBox,
  requestId: string,
  agentId: string,
  phone: Pick<Phone, 'phone_id' | 'sign' | 'signs'>,
): Promise<{ answer: Answer; signed: boolean }> {
  const pub = await keys.publicKeys()
  const dh = await keys.dh(b64u_decode(box.enc))
  const from = { agent_id: agentId, phone_id: phone.phone_id, sign: phone.sign, signs: phone.signs }
  try {
    return parseRead(open_answer(dh, pub.kem, JSON.stringify(box), requestId, JSON.stringify(from)))
  } catch (e) {
    if (e instanceof Error && e.message === 'not_signed') throw new NotSignedError()
    throw e
  }
}

/**
 * Waits for the phone to claim `code`, opens the grant with the phone's commitment, sends the one
 * pairing check with this agent's nonce and gets the check number from the phone's answer
 * ("Pairing and the check number" in the protocol). Returns `null` when the code expired
 * unclaimed. Returns the phone, but does not keep it: the person must first confirm that both
 * screens show the same number ([`rememberPhone`]). When the pairing cannot finish, this agent
 * leaves the phone at the relay, so the phone drops it, and a [`PairingError`] says why.
 */
export async function finishPairing(code: string): Promise<Phone | null> {
  const agent = await store.agent()
  if (!agent) throw new Error('no agent identity')
  const r = await relay(agent.agent_id)
  const claimed = await keepAlive(pollUntil(PAIRING_MS, (wait) => r.waitPairing(code, wait)))
  if (!claimed) return null
  const stop = async (why: unknown): Promise<never> => {
    try {
      await r.leave(claimed.phone_id)
    } catch {
      // The phone gives up by itself after 120 s without a pairing check.
    }
    throw why
  }
  try {
    const pub = await keys.publicKeys()
    let grant
    try {
      const dh = await keys.dh(b64u_decode(claimed.enc))
      grant = parseGrant(open_grant(dh, pub.kem, JSON.stringify(claimed), code))
    } catch (e) {
      // Never pair by the number of an app made before the commitment: a relay could pretend
      // to be such an app.
      throw e instanceof Error && e.message === 'old_app' ? new PairingError('old_app') : e
    }
    const now = Math.floor(Date.now() / 1000)
    const check = parseToSign(
      pairing_check_to_sign(agent.name, agent.agent_id, grant.phone_id, now),
    )
    const sealed = await sealSigned(check, agent.agent_id, grant.kem)
    await r.postRequest(grant.phone_id, sealed)
    const box = await keepAlive(
      pollUntil(REQUEST_MS, (wait) => r.waitAnswer(sealed.request_id, wait)),
    )
    if (!box) throw new PairingError('check')
    let number: string
    try {
      const { answer } = await openAnswer(box, sealed.request_id, agent.agent_id, {
        phone_id: grant.phone_id,
        sign: grant.sign,
        signs: true,
      })
      number = finish_pairing(
        JSON.stringify({
          answer,
          commit: grant.commit,
          nonce: check.nonce,
          agent_sign: pub.sign,
          agent_kem: pub.kem,
          phone_sign: grant.sign,
          phone_kem: grant.kem,
        }),
      )
    } catch {
      throw new PairingError('check')
    }
    return {
      phone_id: grant.phone_id,
      name: grant.phone_name,
      sign: grant.sign,
      kem: grant.kem,
      check: number,
      scope: grant.scope,
      paired_at: now,
      signs: true,
    }
  } catch (e) {
    return stop(e)
  }
}

/** Keeps a paired phone, replacing an earlier pairing with the same phone. */
export async function rememberPhone(phone: Phone): Promise<void> {
  const others = (await store.phones()).filter((p) => p.phone_id !== phone.phone_id)
  await store.setPhones([...others, phone])
}

/** Leaves a phone at the relay without keeping it (a pairing the person did not confirm). */
export async function leave(phoneId: string): Promise<void> {
  const agent = await store.agent()
  if (!agent) return
  try {
    await (await relay(agent.agent_id)).leave(phoneId)
  } catch {
    // Not kept here anyway; the phone gives up the pairing by itself.
  }
}

/** Leaves a phone: tells the relay (best effort) and forgets it here. */
export async function unpair(phoneId: string): Promise<void> {
  const agent = await store.agent()
  if (agent) {
    try {
      await (await relay(agent.agent_id)).leave(phoneId)
    } catch {
      // Forgotten here anyway; the person can remove the agent on the phone.
    }
  }
  await store.setPhones((await store.phones()).filter((p) => p.phone_id !== phoneId))
  const pending = await store.pending()
  await store.setPending(pending.filter((o) => o.phoneId !== phoneId))
}

export interface Ask {
  kind: Kind
  /** The request's `target`: the site, or `site/account` (see `requestTarget`). */
  site: string
  reason: string
  picture?: Picture | null
  save?: { url: string; username: string; title?: string; password: SealedBox }
  /** The `passkey` object of a passkey request (`docs/agent-protocol.md`). */
  passkey?: Record<string, unknown>
  /** The `card` object of a card request. */
  card?: Record<string, unknown>
  /** The `save_card` object of a card save (number and CVC sealed already). */
  saveCard?: Record<string, unknown>
  /** The `suggest` object of a suggestion: a sign-in method and what happened. No secret. */
  suggest?: Record<string, unknown>
  /** `sms_code`: how long the phone waits for the SMS, in seconds (30 to 300). */
  waitSeconds?: number
  client: ClientInfo
}

/** The result of a request: the phone's answer, or `null` when it did not answer in time. */
export type Outcome = { answer: Answer; phone: Phone } | { answer: null; phone: Phone }

/**
 * Sends one request to the current phone and waits up to two minutes for the answer (an
 * `sms_code` request as long as the relay keeps it). After `signal` aborts, the wait ends as if
 * the phone did not answer.
 */
export async function ask(a: Ask, phone: Phone, signal?: AbortSignal): Promise<Outcome> {
  const agent = await store.agent()
  if (!agent) throw new Error('no agent identity')
  const r = await relay(agent.agent_id)
  const draft: Record<string, unknown> = {
    kind: a.kind,
    target: a.site,
    reason: a.reason,
    agent: agent.name,
    client: a.client,
  }
  if (a.picture) draft.caption = a.picture.caption
  if (a.save) draft.save = a.save
  if (a.passkey) draft.passkey = a.passkey
  if (a.card) draft.card = a.card
  if (a.saveCard) draft.save_card = a.saveCard
  if (a.suggest) draft.suggest = a.suggest
  if (a.waitSeconds !== undefined) draft.wait_seconds = a.waitSeconds
  const nowSeconds = Math.floor(Date.now() / 1000)
  // The request says the picture's type, size and SHA-256; the phone shows only that picture.
  const image = a.picture?.bytes ?? new Uint8Array()
  const sealed = await sealSigned(
    parseToSign(
      request_to_sign(JSON.stringify(draft), agent.agent_id, phone.phone_id, nowSeconds, image),
    ),
    agent.agent_id,
    phone.kem,
  )
  // Seal the picture before posting, so its upload follows the request at once (the relay holds
  // the push for it at most 5 s).
  const attachment = a.picture
    ? seal_attachment(sealed.request_id, agent.agent_id, phone.kem, a.picture.bytes)
    : null
  await r.postRequest(phone.phone_id, sealed)
  const started = Date.now()
  if (attachment) {
    try {
      await r.putAttachment(sealed.request_id, attachment)
    } catch {
      // The request went out; it is shown without the picture.
    }
  }
  const box = await keepAlive(
    pollUntil(waitMs(sealed.envelope.ttl) - (Date.now() - started), (wait) =>
      signal?.aborted
        ? Promise.resolve({ kind: 'gone' as const })
        : r.waitAnswer(sealed.request_id, wait),
    ),
  )
  if (!box) return { answer: null, phone }
  const { answer, signed } = await openAnswer(box, sealed.request_id, agent.agent_id, phone)
  if (signed && !phone.signs) {
    // From the first signed answer on, this phone must sign ("Signed requests and answers").
    phone = { ...phone, signs: true }
    await markSigns(phone.phone_id)
  }
  return { answer, phone }
}

async function markSigns(phoneId: string): Promise<void> {
  const list = await store.phones()
  await store.setPhones(list.map((p) => (p.phone_id === phoneId ? { ...p, signs: true } : p)))
}

export { RelayError }
