/**
 * The origin rules for passkeys (ADR-0007). The background takes the caller's origin from the
 * browser (`sender.origin`, `sender.url`), never from the page; `clientDataJSON` is built from it
 * by nodkey-proto. The phone checks the same rules again.
 */

import { PasskeyError } from '../models/passkey'

interface Sender {
  origin?: string
  url?: string
}

/** The caller's origin as the browser reports it, or `null` for an opaque or unknown origin. */
export function senderOrigin(sender: Sender): string | null {
  let origin = sender.origin
  if (origin === undefined && sender.url !== undefined) {
    try {
      origin = new URL(sender.url).origin
    } catch {
      return null
    }
  }
  return origin && origin !== 'null' ? origin : null
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
}

/**
 * The host of a secure caller: `https://<domain>` or `http://localhost[:port]`. Anything else
 * (plain HTTP on the network, IP addresses, other schemes) is a `SecurityError`.
 */
export function secureHost(origin: string): string {
  let u: URL
  try {
    u = new URL(origin)
  } catch {
    throw new PasskeyError('SecurityError', 'the origin is not valid')
  }
  const host = u.hostname.toLowerCase()
  const secure = u.protocol === 'https:' || (u.protocol === 'http:' && host === 'localhost')
  if (!secure || !host || isIpAddress(host)) {
    throw new PasskeyError('SecurityError', 'passkeys need an HTTPS page')
  }
  return host
}

/**
 * The relying party id for a call from `host`: the page's `rpId`, or the host when the page names
 * none. It must be the host or a parent domain of it, and have a dot (or be `localhost`).
 */
export function rpIdFor(host: string, requested: string | undefined): string {
  const rpId = (requested ?? host).toLowerCase()
  const related = rpId === host || host.endsWith(`.${rpId}`)
  const named = rpId === 'localhost' || (rpId.includes('.') && !rpId.startsWith('.'))
  if (!related || !named || rpId.endsWith('.') || isIpAddress(rpId)) {
    throw new PasskeyError('SecurityError', `the page may not use passkeys for ${rpId}`)
  }
  return rpId
}

/**
 * The frame rule: the top frame, or a frame on the top frame's origin whose ancestors are all on
 * that origin (the bridge checks the ancestors; `topUrl` is the tab's address).
 */
export function checkFrame(
  frameId: number | undefined,
  origin: string,
  topUrl: string | undefined,
  sameOriginAncestors: boolean,
): void {
  if (frameId === 0) return
  const top = topUrl === undefined ? null : senderOrigin({ url: topUrl })
  if (frameId === undefined || !sameOriginAncestors || top !== origin) {
    throw new PasskeyError('SecurityError', 'passkeys are not allowed in a cross-origin frame')
  }
}
