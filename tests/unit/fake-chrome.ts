/**
 * A small in-memory stand-in for the `chrome` APIs the background uses, for tests that run the
 * real background code outside a browser.
 */

import { readFileSync } from 'node:fs'
import { initSync } from '../../src/wasm/nodkey.js'
import type { KeyStore, StoredKeys } from '../../src/background/keys'

type Area = Map<string, unknown>

function area(map: Area) {
  return {
    get: (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key]
      const out: Record<string, unknown> = {}
      for (const k of keys) if (map.has(k)) out[k] = structuredClone(map.get(k))
      return Promise.resolve(out)
    },
    set: (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) map.set(k, structuredClone(v))
      return Promise.resolve()
    },
    remove: (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key]) map.delete(k)
      return Promise.resolve()
    },
  }
}

export function installFakeChrome(): { local: Area; session: Area } {
  const local: Area = new Map()
  const session: Area = new Map()
  const chrome = {
    storage: { local: area(local), session: area(session) },
    // Activity for a tab goes nowhere: there are no pages.
    tabs: { sendMessage: () => Promise.resolve(undefined) },
    runtime: {
      id: 'test',
      getPlatformInfo: () => Promise.resolve({ os: 'linux', arch: 'x86-64' }),
      getManifest: () => ({ version: '0.0.0-test' }),
    },
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = chrome
  return { local, session }
}

export function memoryKeyStore(): KeyStore {
  let keys: StoredKeys | null = null
  return {
    get: () => Promise.resolve(keys),
    put: (k) => {
      keys = k
      return Promise.resolve()
    },
    delete: () => {
      keys = null
      return Promise.resolve()
    },
  }
}

let wasmReady = false

/** Loads the WebAssembly module from src/wasm (run `npm run wasm` first). */
export function loadWasm(): void {
  if (wasmReady) return
  initSync({ module: readFileSync(new URL('../../src/wasm/nodkey_bg.wasm', import.meta.url)) })
  wasmReady = true
}
