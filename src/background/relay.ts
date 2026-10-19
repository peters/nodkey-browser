/**
 * Signed calls to the Nodkey relay ("Relay API" in the protocol). Every call carries a
 * `Nodkey-Auth` header signed with the agent's Ed25519 key; bodies are ciphertext or public keys.
 */

import { auth_header, auth_message } from '../wasm/nodkey.js'
import {
  type PairingClaimed,
  type SealedBox,
  type SealedRequest,
  parseClaimed,
  parsePairingCode,
  parseSealedBox,
} from '../models/protocol'
import { relayAddressOk } from '../utils/relay'
import { sign } from './keys'

/** A relay answer that was not what the call expects. */
export class RelayError extends Error {
  override name = 'RelayError'
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(
      message ? `relay answered ${status} ${code}: ${message}` : `relay answered ${status} ${code}`,
    )
  }

  /** Worth another try during a long poll: no connection, or a server error. */
  get transient(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

/** One long-poll round: the value, "ask again", or "gone" (expired or unknown). */
export type Poll<T> = { kind: 'ready'; value: T } | { kind: 'pending' } | { kind: 'gone' }

export interface AgentInfo {
  agent_id: string
  name: string
  sign: string
  kem: string
}

export class Relay {
  private readonly base: string

  constructor(
    base: string,
    private readonly agentId: string,
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
  ) {
    const trimmed = base.trim().replace(/\/+$/, '')
    if (!relayAddressOk(trimmed)) {
      throw new Error('the relay address must start with https:// (http:// only on this computer)')
    }
    this.base = trimmed
  }

  private async call(
    method: string,
    path: string,
    body: Uint8Array | null,
    contentType: string | null,
    timeoutMs: number,
  ): Promise<{ status: number; text: string }> {
    const ts = Math.floor(Date.now() / 1000)
    const bytes = body ?? new Uint8Array()
    const signature = await sign(auth_message(method, path, ts, bytes))
    const headers: Record<string, string> = {
      'Nodkey-Auth': auth_header(this.agentId, ts, signature),
    }
    if (contentType) headers['Content-Type'] = contentType
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
    try {
      // A relay never redirects: a redirect is an error, never followed.
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'error',
      }
      if (body) init.body = new Uint8Array(body)
      const resp = await this.fetcher(this.base + path, init)
      return { status: resp.status, text: await resp.text() }
    } catch (e) {
      const why = controller.signal.aborted ? 'timed out' : String(e)
      throw new RelayError(0, 'unreachable', why)
    } finally {
      clearTimeout(timer)
    }
  }

  private static fail(status: number, text: string): RelayError {
    try {
      const v = JSON.parse(text) as { error?: unknown; message?: unknown }
      if (typeof v.error === 'string') {
        return new RelayError(status, v.error, typeof v.message === 'string' ? v.message : '')
      }
    } catch {
      // Not the relay's error body; use the status alone.
    }
    return new RelayError(status, 'error', '')
  }

  private static json(info: object): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(info))
  }

  private static poll<T>(status: number, text: string, parse: (v: unknown) => T): Poll<T> {
    if (status === 200) return { kind: 'ready', value: parse(JSON.parse(text)) }
    if (status === 204) return { kind: 'pending' }
    if (status === 404 || status === 410) return { kind: 'gone' }
    throw Relay.fail(status, text)
  }

  /** `POST /v1/pairings`: the code to type on the phone. */
  async startPairing(info: AgentInfo): Promise<{ code: string; expires: number }> {
    const r = await this.call('POST', '/v1/pairings', Relay.json(info), 'application/json', 30_000)
    if (r.status !== 201) throw Relay.fail(r.status, r.text)
    return parsePairingCode(JSON.parse(r.text))
  }

  /** `GET /v1/pairings/{code}?wait=N`. */
  async waitPairing(code: string, wait: number): Promise<Poll<PairingClaimed>> {
    const path = `/v1/pairings/${encodeURIComponent(code)}?wait=${wait}`
    const r = await this.call('GET', path, null, null, (wait + 15) * 1000)
    return Relay.poll(r.status, r.text, parseClaimed)
  }

  /** `POST /v1/phones/{phone_id}/requests`. */
  async postRequest(phoneId: string, sealed: SealedRequest): Promise<void> {
    const path = `/v1/phones/${encodeURIComponent(phoneId)}/requests`
    const r = await this.call('POST', path, Relay.json(sealed.envelope), 'application/json', 30_000)
    if (r.status !== 202) throw Relay.fail(r.status, r.text)
  }

  /** `PUT /v1/requests/{request_id}/attachment` with the sealed picture. */
  async putAttachment(requestId: string, body: Uint8Array): Promise<void> {
    const path = `/v1/requests/${encodeURIComponent(requestId)}/attachment`
    const r = await this.call('PUT', path, body, 'application/octet-stream', 60_000)
    if (r.status !== 204) throw Relay.fail(r.status, r.text)
  }

  /** `GET /v1/requests/{request_id}?wait=N`. */
  async waitAnswer(requestId: string, wait: number): Promise<Poll<SealedBox>> {
    const path = `/v1/requests/${encodeURIComponent(requestId)}?wait=${wait}`
    const r = await this.call('GET', path, null, null, (wait + 15) * 1000)
    return Relay.poll(r.status, r.text, parseSealedBox)
  }

  /** `DELETE /v1/agents/{agent_id}/phones/{phone_id}`: this agent leaves the phone. */
  async leave(phoneId: string): Promise<void> {
    const path = `/v1/agents/${encodeURIComponent(this.agentId)}/phones/${encodeURIComponent(phoneId)}`
    const r = await this.call('DELETE', path, null, null, 30_000)
    if (r.status !== 204 && r.status !== 404) throw Relay.fail(r.status, r.text)
  }
}

/**
 * Long-polls with `poll(wait)` until a value arrives, the resource is gone or `totalMs` runs out
 * (`null`). Connection problems and server errors are retried within the same deadline.
 */
export async function pollUntil<T>(
  totalMs: number,
  poll: (wait: number) => Promise<Poll<T>>,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T | null> {
  const deadline = now() + totalMs
  let failures = 0
  for (;;) {
    const remaining = deadline - now()
    if (remaining <= 0) return null
    const wait = Math.min(60, Math.max(1, Math.floor(remaining / 1000)))
    const started = now()
    try {
      const r = await poll(wait)
      if (r.kind === 'ready') return r.value
      if (r.kind === 'gone') return null
      failures = 0
    } catch (e) {
      if (!(e instanceof RelayError) || !e.transient || ++failures > 20) throw e
    }
    // Never spin: a relay that answers at once is asked again after a short pause.
    const took = now() - started
    if (took < 500) await sleep(Math.min(500 - took, Math.max(0, deadline - now())))
  }
}
