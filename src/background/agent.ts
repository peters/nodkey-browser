/**
 * What the extension does as a Nodkey agent: pair with the phone, send one request and wait for
 * the answer. The protocol steps run in the WebAssembly module (nodkey-proto from nodkey-cli);
 * the private-key steps run in WebCrypto (`keys.ts`); the network calls in `relay.ts`.
 */

import {
  b64u_decode,
  open_answer,
  open_grant,
  random_id,
  seal_attachment,
  seal_request,
} from '../wasm/nodkey.js'
import {
  type Answer,
  type Kind,
  type Phone,
  type SealedBox,
  parseAnswer,
  parsePhone,
  parseSealedRequest,
} from '../models/protocol'
import * as keys from './keys'
import { Relay, RelayError, pollUntil } from './relay'
import * as store from './store'

/** How long a request waits for the person (protocol: 120 s). */
export const REQUEST_MS = 120_000
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
 * Waits for the phone to claim `code`, opens the grant and checks the check number. Returns `null`
 * when the code expired unclaimed. The caller keeps the phone with [`rememberPhone`].
 */
export async function finishPairing(code: string): Promise<Phone | null> {
  const agent = await store.agent()
  if (!agent) throw new Error('no agent identity')
  const r = await relay(agent.agent_id)
  const claimed = await keepAlive(pollUntil(PAIRING_MS, (wait) => r.waitPairing(code, wait)))
  if (!claimed) return null
  const pub = await keys.publicKeys()
  const dh = await keys.dh(b64u_decode(claimed.enc))
  const paired: unknown = JSON.parse(
    open_grant(dh, pub.sign, pub.kem, JSON.stringify(claimed), code),
  )
  return parsePhone({ ...(paired as object), paired_at: Math.floor(Date.now() / 1000) })
}

/** Keeps a paired phone, replacing an earlier pairing with the same phone. */
export async function rememberPhone(phone: Phone): Promise<void> {
  const others = (await store.phones()).filter((p) => p.phone_id !== phone.phone_id)
  await store.setPhones([...others, phone])
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
  client: ClientInfo
}

/** The result of a request: the phone's answer, or `null` when it did not answer in time. */
export type Outcome = { answer: Answer; phone: Phone } | { answer: null; phone: Phone }

/**
 * Sends one request to the current phone and waits up to two minutes for the answer. After
 * `signal` aborts, the wait ends as if the phone did not answer.
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
  if (a.picture) {
    draft.attachment = {
      type: a.picture.type,
      bytes: a.picture.bytes.length,
      caption: a.picture.caption,
    }
  }
  if (a.save) draft.save = a.save
  if (a.passkey) draft.passkey = a.passkey
  if (a.card) draft.card = a.card
  if (a.saveCard) draft.save_card = a.saveCard
  const nowSeconds = Math.floor(Date.now() / 1000)
  const sealed = parseSealedRequest(
    seal_request(JSON.stringify(draft), agent.agent_id, phone.kem, nowSeconds),
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
    pollUntil(REQUEST_MS - (Date.now() - started), (wait) =>
      signal?.aborted
        ? Promise.resolve({ kind: 'gone' as const })
        : r.waitAnswer(sealed.request_id, wait),
    ),
  )
  if (!box) return { answer: null, phone }
  const pub = await keys.publicKeys()
  const dh = await keys.dh(b64u_decode(box.enc))
  const answer = parseAnswer(
    open_answer(dh, pub.kem, JSON.stringify(box), sealed.request_id, phone.phone_id),
  )
  return { answer, phone }
}

export { RelayError }
