/**
 * The protocol types the extension handles, and checks for data that comes from outside (the
 * relay, the WebAssembly module, storage). The binding contract is `docs/agent-protocol.md` in
 * peters/nodkey-cli.
 */

export type Kind = 'code' | 'login' | 'list' | 'insights' | 'cleanup' | 'save' | 'passkey' | 'card'
export type Decision = 'approved' | 'denied' | 'expired'
export type Scope = 'selected' | 'codes' | 'logins' | 'all'
export type Saved = 'added' | 'updated' | 'unchanged'

export interface SealedBox {
  enc: string
  ct: string
}

export interface Account {
  issuer: string
  name: string
  site?: string
}

/** The phone's answer, after opening. May hold a code or a password: never store it. */
export interface Answer {
  v: number
  request_id: string
  decision: Decision
  account?: Account
  code?: string
  seconds_left?: number
  username?: string
  password?: string
  saved?: Saved
  passkey?: PasskeyAnswer
  card?: CardAnswer
  error?: string
}

/** An amount: a decimal string with a dot and an ISO 4217 code (`docs/agent-protocol.md`). */
export interface Money {
  value: string
  currency: string
}

/** The card of an approved card request. Only for filling at once: never store or log it. */
export interface CardAnswer {
  title: string
  brand: string
  last4: string
  holder?: string
  number: string
  exp_month: number
  exp_year: number
  cvc?: string
  approved_amount: Money
}

/** The phone's passkey answer (base64url values): an assertion (get) or a new passkey (create). */
export interface PasskeyAnswer {
  credential_id: string
  authenticator_data: string
  /** Get: the DER ECDSA signature over `authenticator_data ‖ SHA-256(client_data_json)`. */
  signature?: string
  user_handle?: string
  user_name?: string
  /** Create: the attestation object (CBOR), the public key (SPKI DER) and its COSE algorithm. */
  attestation_object?: string
  public_key?: string
  public_key_algorithm?: number
}

/** A paired phone, as kept in storage (public keys only). */
export interface Phone {
  phone_id: string
  name: string
  sign: string
  kem: string
  /** As shown: "418 902". */
  check: string
  scope: Scope
  paired_at: number
}

/** `GET /v1/pairings/{code}` once a phone claimed the code. */
export interface PairingClaimed {
  phone_id: string
  sign: string
  kem: string
  enc: string
  ct: string
}

/** What `seal_request` in the WebAssembly module returns. */
export interface SealedRequest {
  request_id: string
  envelope: { request_id: string; enc: string; ct: string; attachment?: boolean }
}

export class ProtocolError extends Error {
  override name = 'ProtocolError'
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new ProtocolError(`${key} must be a string`)
  return v
}

function optStr(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new ProtocolError(`${key} must be a string`)
  return v
}

function oneOf<T extends string>(o: Record<string, unknown>, key: string, values: readonly T[]): T {
  const v = o[key]
  if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T
  throw new ProtocolError(`${key} is not one of ${values.join(', ')}`)
}

const B64U = /^[A-Za-z0-9_-]+$/

export function parseSealedBox(v: unknown): SealedBox {
  if (!isObject(v)) throw new ProtocolError('expected {enc, ct}')
  const enc = str(v, 'enc')
  const ct = str(v, 'ct')
  if (!B64U.test(enc) || !B64U.test(ct)) throw new ProtocolError('enc and ct must be base64url')
  return { enc, ct }
}

export function parseClaimed(v: unknown): PairingClaimed {
  if (!isObject(v)) throw new ProtocolError('expected a claimed pairing')
  const out = {
    phone_id: str(v, 'phone_id'),
    sign: str(v, 'sign'),
    kem: str(v, 'kem'),
    enc: str(v, 'enc'),
    ct: str(v, 'ct'),
  }
  for (const [k, value] of Object.entries(out)) {
    if (!B64U.test(value)) throw new ProtocolError(`${k} must be base64url`)
  }
  return out
}

export function parsePairingCode(v: unknown): { code: string; expires: number } {
  if (!isObject(v)) throw new ProtocolError('expected {code, expires}')
  const code = str(v, 'code')
  const expires = v.expires
  if (typeof expires !== 'number') throw new ProtocolError('expires must be a number')
  return { code, expires }
}

/** Checks an opened answer from the WebAssembly module. */
export function parseAnswer(json: string): Answer {
  const v: unknown = JSON.parse(json)
  if (!isObject(v)) throw new ProtocolError('expected an answer')
  const answer: Answer = {
    v: typeof v.v === 'number' ? v.v : 0,
    request_id: str(v, 'request_id'),
    decision: oneOf(v, 'decision', ['approved', 'denied', 'expired'] as const),
  }
  const account = v.account
  if (isObject(account)) {
    answer.account = { issuer: str(account, 'issuer'), name: str(account, 'name') }
    const site = optStr(account, 'site')
    if (site !== undefined) answer.account.site = site
  }
  const code = optStr(v, 'code')
  if (code !== undefined) answer.code = code
  if (typeof v.seconds_left === 'number') answer.seconds_left = v.seconds_left
  const username = optStr(v, 'username')
  if (username !== undefined) answer.username = username
  const password = optStr(v, 'password')
  if (password !== undefined) answer.password = password
  if (v.saved !== undefined) {
    answer.saved = oneOf(v, 'saved', ['added', 'updated', 'unchanged'] as const)
  }
  if (isObject(v.passkey)) answer.passkey = parsePasskeyAnswer(v.passkey)
  if (isObject(v.card)) answer.card = parseCardAnswer(v.card)
  const error = optStr(v, 'error')
  if (error !== undefined) answer.error = error
  return answer
}

export function parseMoney(v: unknown): Money {
  if (!isObject(v)) throw new ProtocolError('expected {value, currency}')
  const value = str(v, 'value')
  const currency = str(v, 'currency')
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(value) || !/^[A-Z]{3}$/.test(currency)) {
    throw new ProtocolError('not an amount')
  }
  return { value, currency }
}

function int(o: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new ProtocolError(`${key} is out of range`)
  }
  return v
}

function parseCardAnswer(o: Record<string, unknown>): CardAnswer {
  const card: CardAnswer = {
    title: str(o, 'title'),
    brand: str(o, 'brand'),
    last4: str(o, 'last4'),
    number: str(o, 'number'),
    exp_month: int(o, 'exp_month', 1, 12),
    exp_year: int(o, 'exp_year', 2000, 2099),
    approved_amount: parseMoney(o.approved_amount),
  }
  if (!/^\d{12,19}$/.test(card.number) || !/^\d{4}$/.test(card.last4)) {
    throw new ProtocolError('not a card number')
  }
  const holder = optStr(o, 'holder')
  if (holder !== undefined) card.holder = holder
  const cvc = optStr(o, 'cvc')
  if (cvc !== undefined) {
    if (!/^\d{3,4}$/.test(cvc)) throw new ProtocolError('not a CVC')
    card.cvc = cvc
  }
  return card
}

function optB64u(o: Record<string, unknown>, key: string): string | undefined {
  const v = optStr(o, key)
  if (v !== undefined && !B64U.test(v)) throw new ProtocolError(`${key} must be base64url`)
  return v
}

function parsePasskeyAnswer(o: Record<string, unknown>): PasskeyAnswer {
  const out: PasskeyAnswer = {
    credential_id: str(o, 'credential_id'),
    authenticator_data: str(o, 'authenticator_data'),
  }
  if (!B64U.test(out.credential_id) || !B64U.test(out.authenticator_data)) {
    throw new ProtocolError('credential_id and authenticator_data must be base64url')
  }
  for (const key of ['signature', 'user_handle', 'attestation_object', 'public_key'] as const) {
    const value = optB64u(o, key)
    if (value !== undefined) out[key] = value
  }
  const userName = optStr(o, 'user_name')
  if (userName !== undefined) out.user_name = userName
  if (typeof o.public_key_algorithm === 'number') {
    out.public_key_algorithm = o.public_key_algorithm
  }
  return out
}

/** Checks a paired phone from the WebAssembly module or storage. */
export function parsePhone(v: unknown): Phone {
  if (!isObject(v)) throw new ProtocolError('expected a phone')
  return {
    phone_id: str(v, 'phone_id'),
    name: str(v, 'phone_name' in v ? 'phone_name' : 'name'),
    sign: str(v, 'sign'),
    kem: str(v, 'kem'),
    check: str(v, 'check'),
    scope: oneOf(v, 'scope', ['selected', 'codes', 'logins', 'all'] as const),
    paired_at: typeof v.paired_at === 'number' ? v.paired_at : 0,
  }
}

export function parseSealedRequest(json: string): SealedRequest {
  const v: unknown = JSON.parse(json)
  if (!isObject(v) || !isObject(v.envelope)) throw new ProtocolError('expected a sealed request')
  const env = v.envelope
  const envelope: SealedRequest['envelope'] = {
    request_id: str(env, 'request_id'),
    enc: str(env, 'enc'),
    ct: str(env, 'ct'),
  }
  if (env.attachment === true) envelope.attachment = true
  return { request_id: str(v, 'request_id'), envelope }
}
