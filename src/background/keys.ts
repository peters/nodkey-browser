/**
 * The agent's two private keys, as non-extractable WebCrypto keys kept in IndexedDB. The
 * extension can sign with them and run the X25519 key agreement, but no code can read them out.
 */

import { b64u_encode } from '../wasm/nodkey.js'

const DB = 'nodkey'
const STORE = 'keys'
const ID = 'agent'

export interface StoredKeys {
  sign: CryptoKeyPair
  kem: CryptoKeyPair
}

/** The public halves, base64url, as the protocol sends them. */
export interface PublicKeys {
  sign: string
  kem: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      resolve(req.result)
    }
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB failed'))
    }
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => {
        resolve(req.result as T)
      }
      req.onerror = () => {
        reject(req.error ?? new Error('IndexedDB failed'))
      }
    })
  } finally {
    db.close()
  }
}

/** Where the key pairs are kept. IndexedDB in the extension; memory in tests. */
export interface KeyStore {
  get(): Promise<StoredKeys | null>
  put(keys: StoredKeys): Promise<void>
  delete(): Promise<void>
}

export const indexedDbStore: KeyStore = {
  get: async () => (await tx<StoredKeys | undefined>('readonly', (s) => s.get(ID))) ?? null,
  put: async (keys) => {
    await tx('readwrite', (s) => s.put(keys, ID))
  },
  delete: async () => {
    await tx('readwrite', (s) => s.delete(ID))
  },
}

let keyStore: KeyStore = indexedDbStore
let cached: StoredKeys | null = null

/** Uses another key store (tests). */
export function useKeyStore(store: KeyStore): void {
  keyStore = store
  cached = null
}

async function load(): Promise<StoredKeys | null> {
  cached ??= await keyStore.get()
  return cached
}

/** Makes new keys, replacing any old ones. */
export async function generate(): Promise<void> {
  const sign = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const kem = await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits'])
  await keyStore.put({ sign, kem })
  cached = { sign, kem }
}

export async function exists(): Promise<boolean> {
  return (await load()) !== null
}

/** Forgets the keys. */
export async function remove(): Promise<void> {
  await keyStore.delete()
  cached = null
}

async function required(): Promise<StoredKeys> {
  const keys = await load()
  if (!keys) throw new Error('This browser has no Nodkey keys yet. Pair first.')
  return keys
}

export async function publicKeys(): Promise<PublicKeys> {
  const keys = await required()
  const sign = new Uint8Array(await crypto.subtle.exportKey('raw', keys.sign.publicKey))
  const kem = new Uint8Array(await crypto.subtle.exportKey('raw', keys.kem.publicKey))
  return { sign: b64u_encode(sign), kem: b64u_encode(kem) }
}

/** Ed25519 signature over the UTF-8 bytes of `message`. */
export async function sign(message: string): Promise<Uint8Array> {
  const keys = await required()
  const data = new TextEncoder().encode(message)
  return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keys.sign.privateKey, data))
}

/** `X25519(agent secret, enc)`: the key agreement for opening what the phone sealed to us. */
export async function dh(enc: Uint8Array): Promise<Uint8Array> {
  const keys = await required()
  const peer = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(enc),
    { name: 'X25519' },
    true,
    [],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: peer },
    keys.kem.privateKey,
    256,
  )
  return new Uint8Array(bits)
}
