/**
 * The protocol types the extension handles, and checks for data that comes from outside (the
 * relay, the WebAssembly module, storage). The binding contract is `docs/agent-protocol.md` in
 * peters/nodkey-cli.
 */

export type Kind =
  | 'code'
  | 'login'
  | 'list'
  | 'insights'
  | 'cleanup'
  | 'save'
  | 'passkey'
  | 'card'
  | 'suggest'
  | 'sms_code'
/** `queued` and `rejected` come only for `suggest`. */
export type Decision = 'approved' | 'denied' | 'expired' | 'queued' | 'rejected'
export type LeaseKind = 'once' | 'day' | 'week' | 'always' | 'session'
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
  /** The account's extra websites ("Also used on" in the app). */
  sites?: string[]
}

/** How the phone found the account: its site, an extra website, or picked by hand for this site. */
export type MatchKind = 'direct' | 'alias' | 'chosen'

/** How a site is signed in to ("Sign-in methods" in the protocol). It holds no secret. */
export type SignInKind = 'password' | 'federated' | 'passkey' | 'email_code' | 'sso' | 'sms'
export type Provider = 'google' | 'apple' | 'github' | 'microsoft' | 'facebook' | 'other'
export type SecondStep = 'passkey' | 'totp' | 'app_prompt' | 'sms' | 'email'

export interface SignInMethod {
  kind: SignInKind
  provider?: Provider
  provider_name?: string
  certainty?: 'confirmed' | 'seen' | 'likely'
  mailbox?: string
  source?: 'manual' | 'agent' | 'extension' | 'import'
}

/** The provider login of a `federated` method: fill it only on the provider's own pages. */
export interface Via {
  account: Account
  username?: string
  password?: string
  code?: string
  seconds_left?: number
  next_code?: string
  next_seconds_left?: number
}

export interface SecondStepOrder {
  prefer: SecondStep[]
  avoid: SecondStep[]
}

/** The agent limit's count (`quota_warning`, or `paused` by the limit). */
export interface Quota {
  new_today: number
  limit: number
  burst?: boolean
}

/** The phone's answer, after opening. May hold a code or a password: never store it. */
export interface Answer {
  v: number
  request_id: string
  decision: Decision
  lease?: { kind: LeaseKind; until?: number }
  account?: Account
  match?: MatchKind
  code?: string
  seconds_left?: number
  next_code?: string
  next_seconds_left?: number
  username?: string
  password?: string
  saved?: Saved
  passkey?: PasskeyAnswer
  card?: CardAnswer
  error?: string
  method?: SignInMethod
  via?: Via
  second_step?: SecondStepOrder
  quota?: Quota
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
  /** The WebAuthn PRF outputs (secret keys: never log or keep them). */
  prf?: PrfOutput
}

export interface PrfOutput {
  /** Create only: the new passkey supports PRF. */
  enabled?: boolean
  results?: { first: string; second?: string }
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
  envelope: { request_id: string; enc: string; ct: string; attachment?: boolean; ttl?: number }
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
    decision: oneOf(v, 'decision', [
      'approved',
      'denied',
      'expired',
      'queued',
      'rejected',
    ] as const),
  }
  if (isObject(v.lease)) {
    answer.lease = {
      kind: oneOf(v.lease, 'kind', ['once', 'day', 'week', 'always', 'session'] as const),
    }
    if (typeof v.lease.until === 'number') answer.lease.until = v.lease.until
  }
  if (isObject(v.account)) answer.account = parseAccount(v.account)
  // A match this version does not know counts as absent, never as chosen.
  if (v.match === 'direct' || v.match === 'alias' || v.match === 'chosen') answer.match = v.match
  Object.assign(answer, codes(v))
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
  // The WebAssembly module read these tolerantly already (an unknown kind or step is left out).
  if (isObject(v.method)) answer.method = parseMethod(v.method)
  if (isObject(v.via)) answer.via = parseVia(v.via)
  if (isObject(v.second_step)) answer.second_step = parseOrder(v.second_step)
  if (isObject(v.quota) && typeof v.quota.new_today === 'number') {
    answer.quota = {
      new_today: v.quota.new_today,
      limit: typeof v.quota.limit === 'number' ? v.quota.limit : 0,
    }
    if (v.quota.burst === true) answer.quota.burst = true
  }
  return answer
}

function parseAccount(o: Record<string, unknown>): Account {
  const account: Account = { issuer: str(o, 'issuer'), name: str(o, 'name') }
  const site = optStr(o, 'site')
  if (site !== undefined) account.site = site
  if (Array.isArray(o.sites)) {
    const sites = o.sites.filter((x): x is string => typeof x === 'string')
    if (sites.length > 0) account.sites = sites
  }
  return account
}

/** The code fields of an answer or of its `via`. */
function codes(o: Record<string, unknown>): Partial<Via> {
  const out: Partial<Via> = {}
  const code = optStr(o, 'code')
  if (code !== undefined) out.code = code
  if (typeof o.seconds_left === 'number') out.seconds_left = o.seconds_left
  const next = optStr(o, 'next_code')
  if (next !== undefined) out.next_code = next
  if (typeof o.next_seconds_left === 'number') out.next_seconds_left = o.next_seconds_left
  return out
}

const KINDS = ['password', 'federated', 'passkey', 'email_code', 'sso', 'sms'] as const
const PROVIDERS = ['google', 'apple', 'github', 'microsoft', 'facebook', 'other'] as const
const STEPS = ['passkey', 'totp', 'app_prompt', 'sms', 'email'] as const

function parseMethod(o: Record<string, unknown>): SignInMethod {
  const method: SignInMethod = { kind: oneOf(o, 'kind', KINDS) }
  if (o.provider !== undefined) method.provider = oneOf(o, 'provider', PROVIDERS)
  const name = optStr(o, 'provider_name')
  if (name !== undefined) method.provider_name = name.slice(0, 40)
  if (o.certainty !== undefined) {
    method.certainty = oneOf(o, 'certainty', ['confirmed', 'seen', 'likely'] as const)
  }
  const mailbox = optStr(o, 'mailbox')
  if (mailbox !== undefined) method.mailbox = mailbox
  return method
}

function parseVia(o: Record<string, unknown>): Via {
  if (!isObject(o.account)) throw new ProtocolError('via needs its account')
  const via: Via = { account: parseAccount(o.account), ...codes(o) }
  const username = optStr(o, 'username')
  if (username !== undefined) via.username = username
  const password = optStr(o, 'password')
  if (password !== undefined) via.password = password
  return via
}

function parseOrder(o: Record<string, unknown>): SecondStepOrder {
  const steps = (v: unknown): SecondStep[] =>
    Array.isArray(v)
      ? v.filter((s): s is SecondStep => (STEPS as readonly unknown[]).includes(s))
      : []
  return { prefer: steps(o.prefer), avoid: steps(o.avoid) }
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
  if (isObject(o.prf)) {
    const prf: PrfOutput = {}
    if (typeof o.prf.enabled === 'boolean') prf.enabled = o.prf.enabled
    if (isObject(o.prf.results)) {
      const first = optB64u(o.prf.results, 'first')
      if (first === undefined) throw new ProtocolError('prf.results needs first')
      prf.results = { first }
      const second = optB64u(o.prf.results, 'second')
      if (second !== undefined) prf.results.second = second
    }
    out.prf = prf
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
  if (typeof env.ttl === 'number') envelope.ttl = env.ttl
  return { request_id: str(v, 'request_id'), envelope }
}
