/**
 * Passkey calls between the page script, the bridge content script and the background. Binary
 * values travel as base64url. The page is not trusted: the background checks every call with
 * [`parsePasskeyCall`] and decides the origin itself (ADR-0007).
 */

import { isB64u } from '../passkeys/b64u'

export type Requirement = 'required' | 'preferred' | 'discouraged'

export interface PasskeyGetCall {
  op: 'get'
  challenge: string
  /** As the page asked; the background checks it against the caller's origin. */
  rpId?: string
  allowCredentials: string[]
  userVerification: Requirement
}

export interface PasskeyCreateCall {
  op: 'create'
  challenge: string
  rp: { id?: string; name: string }
  user: { id: string; name: string; displayName: string }
  /** COSE algorithm numbers from `pubKeyCredParams`, in the page's order. */
  algorithms: number[]
  excludeCredentials: string[]
  residentKey: Requirement
  userVerification: Requirement
}

export type PasskeyCall = PasskeyGetCall | PasskeyCreateCall

export interface PasskeyGetResult {
  op: 'get'
  clientDataJSON: string
  credentialId: string
  authenticatorData: string
  signature: string
  userHandle?: string
}

export interface PasskeyCreateResult {
  op: 'create'
  clientDataJSON: string
  credentialId: string
  attestationObject: string
  authenticatorData: string
  publicKey: string
  publicKeyAlgorithm: number
}

export type PasskeyResult = PasskeyGetResult | PasskeyCreateResult

/** The DOMException names a passkey call can reject with. */
export type PasskeyErrorName =
  'NotAllowedError' | 'InvalidStateError' | 'SecurityError' | 'NotSupportedError' | 'AbortError'

export type PasskeyReply =
  { ok: true; result: PasskeyResult } | { ok: false; name: PasskeyErrorName; message: string }

/** What the bridge sends on the `passkey` port. */
export interface PasskeyPortMessage {
  call: unknown
  /** The bridge found every ancestor frame on the frame's own origin. */
  sameOriginAncestors: boolean
}

/** The event names between the page script and the bridge (the detail is a JSON string). */
export const PAGE_REQUEST = 'nodkey:passkey-request'
export const PAGE_CANCEL = 'nodkey:passkey-cancel'
export const PAGE_REPLY = 'nodkey:passkey-reply'

export class PasskeyError extends Error {
  constructor(
    readonly domName: PasskeyErrorName,
    message: string,
  ) {
    super(message)
  }
}

// The limits of nodkey-proto (`PasskeyRequest::check`): 64 credential ids, names up to 200.
const LIMIT = { b64u: 2048, list: 64, text: 200, algorithms: 16 }

function bad(what: string): PasskeyError {
  // WebAuthn rejects malformed options with a TypeError; NotSupportedError is the closest name
  // that the page can tell apart from a refusal.
  return new PasskeyError('NotSupportedError', `bad passkey options: ${what}`)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function b64u(v: unknown, what: string, minBytes = 1, maxBytes = 1536): string {
  if (typeof v !== 'string' || !isB64u(v) || v.length > LIMIT.b64u) throw bad(what)
  const bytes = Math.floor((v.length * 3) / 4)
  if (bytes < minBytes || bytes > maxBytes) throw bad(what)
  return v
}

function text(v: unknown, what: string, optional = false): string {
  if (v === undefined && optional) return ''
  if (typeof v !== 'string' || v.length > LIMIT.text) throw bad(what)
  return v
}

function ids(v: unknown, what: string): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > LIMIT.list) throw bad(what)
  return v.map((id) => b64u(id, what))
}

function requirement(v: unknown, fallback: Requirement): Requirement {
  // Unknown values are ignored, as WebAuthn does with unknown enum strings in dictionaries.
  return v === 'required' || v === 'preferred' || v === 'discouraged' ? v : fallback
}

function optRpId(v: unknown): string | undefined {
  if (v === undefined) return undefined
  return text(v, 'rpId')
}

/** Checks a call from the page; throws a [`PasskeyError`] for anything malformed. */
export function parsePasskeyCall(v: unknown): PasskeyCall {
  if (!isObject(v)) throw bad('call')
  const challenge = b64u(v.challenge, 'challenge', 16, 1024)
  if (v.op === 'get') {
    const call: PasskeyGetCall = {
      op: 'get',
      challenge,
      allowCredentials: ids(v.allowCredentials, 'allowCredentials'),
      userVerification: requirement(v.userVerification, 'preferred'),
    }
    const rpId = optRpId(v.rpId)
    if (rpId !== undefined) call.rpId = rpId
    return call
  }
  if (v.op === 'create') {
    const rp = isObject(v.rp) ? v.rp : null
    const user = isObject(v.user) ? v.user : null
    if (!rp || !user) throw bad('rp and user')
    const algorithms = v.algorithms
    if (
      !Array.isArray(algorithms) ||
      algorithms.length === 0 ||
      algorithms.length > LIMIT.algorithms ||
      !algorithms.every((a) => Number.isSafeInteger(a))
    ) {
      throw bad('pubKeyCredParams')
    }
    const call: PasskeyCreateCall = {
      op: 'create',
      challenge,
      rp: { name: text(rp.name, 'rp.name') },
      user: {
        id: b64u(user.id, 'user.id', 1, 64),
        name: text(user.name, 'user.name'),
        displayName: text(user.displayName, 'user.displayName', true),
      },
      algorithms: algorithms as number[],
      excludeCredentials: ids(v.excludeCredentials, 'excludeCredentials'),
      residentKey: requirement(v.residentKey, 'discouraged'),
      userVerification: requirement(v.userVerification, 'preferred'),
    }
    if (!call.user.name.trim()) throw bad('user.name')
    const rpId = optRpId(rp.id)
    if (rpId !== undefined) call.rp.id = rpId
    return call
  }
  throw bad('op')
}
