/**
 * Logins and cards that the person already has in Nodkey: Nodkey filled them, the phone saved
 * them, or the person said "Not now". The save question does not come again for them.
 *
 * The browser stops an idle background, so this cannot live in memory: each one gets a
 * fingerprint in `chrome.storage.local` for 180 days (ADR-0015). The fingerprint is PBKDF2 over
 * the password or the card number, with a random secret of this install as the salt. Thus a
 * password, a card number or a user name is never in the storage, and a fingerprint of another
 * install is a different value. A changed password gives a new fingerprint and is asked about.
 *
 * `chrome.storage.session` also has a key named `known` (the sign-in methods of sites); this
 * module uses `local`.
 */

const SECRET_KEY = 'knownSecret'
const KNOWN_KEY = 'known'

/** The person is asked again after this long: 180 days. */
export const KEEP_MS = 180 * 86_400_000

/** At most this many fingerprints; the oldest go first. */
export const MAX = 2000

const ITERATIONS = 100_000

export type Kind = 'login' | 'card'

/** Why the fingerprint is in the book. */
export type Why = 'filled' | 'saved' | 'declined'

interface Entry {
  at: number
  why: Why
}

type Book = Record<string, Entry>

/** Bytes that WebCrypto takes (`Uint8Array<ArrayBuffer>`, not a shared buffer). */
type Bytes = Uint8Array<ArrayBuffer>

function encode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decode(text: string): Bytes {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The bytes of the salt: the secret, then the kind, the site and the name. */
function salt(secret: Bytes, kind: Kind, site: string, name: string): Bytes {
  const text = new TextEncoder().encode(`\n${kind}\n${site}\n${name}`)
  const bytes = new Uint8Array(secret.length + text.length)
  bytes.set(secret)
  bytes.set(text, secret.length)
  return bytes
}

/** The user name of a login as the fingerprint has it: trimmed, lower case for an address. */
function normalName(username: string): string {
  const name = username.trim()
  return name.includes('@') ? name.toLowerCase() : name
}

let made: Promise<Bytes> | null = null

async function readSecret(): Promise<Bytes> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(SECRET_KEY)
  const text = stored[SECRET_KEY]
  if (typeof text === 'string') {
    try {
      const bytes = decode(text)
      if (bytes.length === 32) return bytes
    } catch {
      // Not base64: make a new one below.
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  await chrome.storage.local.set({ [SECRET_KEY]: encode(bytes) })
  return bytes
}

/** The per-install secret that salts every fingerprint. It is made on first use. */
function secret(): Promise<Bytes> {
  made ??= readSecret()
  return made
}

/**
 * The fingerprint of a login (`name`: its user name) or of a card (`name`: `''` and `material`:
 * the digits of the number), as lower case hex. `material` is the PBKDF2 password, thus the value
 * the person has. The salt is the secret, the kind, the site and the name: the same password on
 * another site or for another user name is another fingerprint.
 */
export async function fingerprint(
  kind: Kind,
  site: string,
  name: string,
  material: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(material),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt(await secret(), kind, site, kind === 'login' ? normalName(name) : ''),
      iterations: ITERATIONS,
    },
    key,
    256,
  )
  return hex(new Uint8Array(bits))
}

/** The book without the entries that are older than 180 days, newest first, at most `MAX`. */
function prune(book: Book): Book {
  const now = Date.now()
  const fresh = Object.entries(book).filter(([, e]) => now - e.at < KEEP_MS)
  fresh.sort((a, b) => b[1].at - a[1].at)
  return Object.fromEntries(fresh.slice(0, MAX))
}

async function all(): Promise<Book> {
  const stored = await chrome.storage.local.get(KNOWN_KEY)
  const book = stored[KNOWN_KEY]
  if (!book || typeof book !== 'object') return {}
  return prune(book as Book)
}

/**
 * Keeps `fp` for 180 days (an entry for it is replaced). The book holds no password, no card
 * number and no user name, only the fingerprints, when each was seen and why.
 */
export async function remember(fp: string, why: Why): Promise<void> {
  if (!fp) return
  const book = await all()
  book[fp] = { at: Date.now(), why }
  await chrome.storage.local.set({ [KNOWN_KEY]: prune(book) })
}

/** Whether `fp` is in the book and younger than 180 days: no save question for it. */
export async function isKnown(fp: string): Promise<boolean> {
  if (!fp) return false
  return Object.hasOwn(await all(), fp)
}

/** Forgets every fingerprint and the secret: after an unpair or a reset. */
export async function clear(): Promise<void> {
  await chrome.storage.local.remove([KNOWN_KEY, SECRET_KEY])
  made = null
}
