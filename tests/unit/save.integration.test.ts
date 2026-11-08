// @vitest-environment node
/**
 * The save question comes only for a login or a card that the person really submitted, and it
 * does not come again for one that Nodkey filled, that the phone saved, or that the person said
 * no to. The real background code runs against nodkey-cli's fake relay and phone; a "restart"
 * drops every module instance and keeps the storage, as the browser stops an idle background.
 * Invented data only.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyStore } from '../../src/background/keys'
import type { CardOffer, SaveOffer, ToBackground, ToContent } from '../../src/models/messages'
import { installFakeChrome, loadWasm, memoryKeyStore } from './fake-chrome'

const BIN = 'target/debug/nodkey-fake-relay'
/** The fake phone's login and its card (see nodkey-cli's fake relay). */
const USER = 'alex@example.com'
const PASSWORD = 'correct horse battery staple'
const CARD = '4242424242424242'
const SIGNIN = 'https://login.example.com/signin'
const SHOP = 'https://shop.example.com/checkout'

let relay: ChildProcess | undefined
let base = ''
let local: Map<string, unknown>
let session: Map<string, unknown>
let keyStore: KeyStore

/** The background's modules; `restart` replaces them with new instances. */
let actions: typeof import('../../src/background/actions')
let cards: typeof import('../../src/background/cards')
let store: typeof import('../../src/background/store')
let agent: typeof import('../../src/background/agent')
let known: typeof import('../../src/background/known')

const tabAt = (url: string, id = 7) => ({ id, windowId: 1, url }) as chrome.tabs.Tab

async function control(path: string, body: unknown): Promise<void> {
  const r = await fetch(base + path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
}

async function seen(): Promise<{ request: Record<string, unknown> }[]> {
  return (await (await fetch(`${base}/_fake/seen`)).json()) as {
    request: Record<string, unknown>
  }[]
}

type Candidate = Extract<ToBackground, { type: 'card.candidate' }>

const typedCard = (number: string): Candidate => ({
  type: 'card.candidate',
  url: SHOP,
  number,
  exp_month: 12,
  exp_year: 2030,
})

/**
 * A new background instance, as after the browser stopped the idle one: every module is new, so
 * nothing in memory survives, and the storage (and the WebCrypto keys) stay.
 */
async function restart(): Promise<void> {
  vi.resetModules()
  const fake = await import('./fake-chrome')
  fake.loadWasm()
  const keys = await import('../../src/background/keys')
  keys.useKeyStore(keyStore)
  actions = await import('../../src/background/actions')
  cards = await import('../../src/background/cards')
  store = await import('../../src/background/store')
  agent = await import('../../src/background/agent')
  known = await import('../../src/background/known')
}

beforeAll(async () => {
  if (!existsSync(BIN)) throw new Error(`${BIN} is missing: run cargo build -p fake-relay`)
  const child = spawn(BIN, ['127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  relay = child
  base = await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      const m = /listening on (\S+)/.exec(chunk.toString())
      if (m?.[1]) resolve(m[1])
    })
    child.on('exit', () => {
      reject(new Error('fake relay exited'))
    })
  })
  const fake = installFakeChrome()
  local = fake.local
  session = fake.session
  const installed = globalThis as unknown as { chrome: { tabs: Record<string, unknown> } }
  installed.chrome.tabs.sendMessage = (_tabId: number, msg: ToContent) =>
    Promise.resolve(
      msg.type === 'fill' ? true : msg.type === 'card.fill' ? { filled: true } : undefined,
    )
  installed.chrome.tabs.captureVisibleTab = () => Promise.reject(new Error('no screen in a test'))
  loadWasm()
  keyStore = memoryKeyStore()
  const keys = await import('../../src/background/keys')
  keys.useKeyStore(keyStore)
  store = await import('../../src/background/store')
  await store.setSettings({ relay: base, screenshots: false })
  agent = await import('../../src/background/agent')
  const { code } = await agent.startPairing('Test browser')
  const phone = await agent.finishPairing(code)
  if (!phone) throw new Error('no pairing')
  await agent.rememberPhone(phone)
  actions = await import('../../src/background/actions')
  cards = await import('../../src/background/cards')
  known = await import('../../src/background/known')
})

afterAll(() => {
  relay?.kill()
})

beforeEach(async () => {
  // The background of this test is the one of `beforeAll`; a test that "restarts" keeps it for
  // the rest of the file, and the pages of an earlier test are gone.
  await restart()
  session.clear()
  await control('/_fake/mode', 'approve')
  await control('/_fake/cards', { enabled: true, reveal: true, limit: null })
})

describe('the save question for a login', () => {
  it('does not come for a login Nodkey filled, also after a restart', async () => {
    const page = tabAt(SIGNIN)
    await actions.fill('login', page, 0, undefined, SIGNIN)
    const filled = (await seen()).at(-1)?.request
    expect(filled?.kind).toBe('login')
    // The browser stops the background before the person submits the form.
    await restart()
    await actions.candidate(page, SIGNIN, USER, PASSWORD, 'Sign in')
    expect(await store.offer(7)).toBeNull()
  })

  it('comes for a login the person typed', async () => {
    const page = tabAt(SIGNIN)
    await actions.candidate(page, SIGNIN, 'typed@example.com', 'a typed password', 'Sign in')
    const offer = (await store.offer(7)) as SaveOffer
    expect(offer.username).toBe('typed@example.com')
    // The fingerprint is hex, and it is not the password.
    expect(offer.fp).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(offer.fp)).not.toContain('typed')
  })

  it('does not come again when the phone saved the login, and the name is a case of the same', async () => {
    const page = tabAt(SIGNIN)
    await actions.candidate(page, SIGNIN, 'saved@example.com', 'a saved password', 'Sign in')
    const offer = (await store.offer(7)) as SaveOffer
    await actions.acceptOffer(page, offer.id)
    expect((await seen()).at(-1)?.request.kind).toBe('save')
    // The phone never gets the fingerprint: the save request is made field by field.
    expect(JSON.stringify((await seen()).at(-1)?.request)).not.toContain('"fp"')
    // The person signs in again, and the page has the address in capitals.
    await actions.candidate(page, SIGNIN, 'Saved@Example.com', 'a saved password', 'Sign in')
    expect(await store.offer(7)).toBeNull()
  })

  it('does not come again after Not now, and comes when the password changed', async () => {
    const page = tabAt(SIGNIN)
    await actions.candidate(page, SIGNIN, 'declined@example.com', 'a declined password', '')
    const offer = (await store.offer(7)) as SaveOffer
    await actions.dismissOffer(page, offer.id, false)
    await actions.candidate(page, SIGNIN, 'declined@example.com', 'a declined password', '')
    expect(await store.offer(7)).toBeNull()
    // A changed password is a new login in Nodkey: ask again.
    await actions.candidate(page, SIGNIN, 'declined@example.com', 'a changed password', '')
    expect((await store.offer(7))?.username).toBe('declined@example.com')
  })
})

describe('the save question for a card', () => {
  it('does not come for a card Nodkey filled, also after a restart', async () => {
    const shop = tabAt(SHOP)
    await cards.fill(shop, 0, SHOP, {
      type: 'card.fill',
      purpose: 'pay',
      amount: { value: '499,00', currency: 'NOK' },
      pageTotal: { value: '499,00', currency: 'NOK' },
      totalSource: 'page',
    })
    const filled = (await seen()).at(-1)?.request
    expect(filled?.kind).toBe('card')
    await restart()
    await cards.candidate(shop, SHOP, typedCard(CARD))
    expect(await store.cardOffer(7)).toBeNull()
  })

  it('comes for a card the person typed, and not again when the phone saved it', async () => {
    const shop = tabAt(SHOP)
    await cards.candidate(shop, SHOP, typedCard('4111111111111111'))
    const offer = (await store.cardOffer(7)) as CardOffer
    expect(offer.last4).toBe('1111')
    expect(offer.fp).toMatch(/^[0-9a-f]{64}$/)
    await cards.acceptOffer(shop, offer.id)
    expect((await seen()).at(-1)?.request.kind).toBe('save')
    expect(JSON.stringify((await seen()).at(-1)?.request)).not.toContain('"fp"')
    await cards.candidate(shop, SHOP, typedCard('4111111111111111'))
    expect(await store.cardOffer(7)).toBeNull()
    // Another card is another card.
    await cards.candidate(shop, SHOP, typedCard('5555555555554444'))
    expect((await store.cardOffer(7))?.last4).toBe('4444')
  })

  it('does not come again after Never for this site', async () => {
    const shop = tabAt(SHOP)
    await cards.candidate(shop, SHOP, typedCard('4012888888881881'))
    const offer = (await store.cardOffer(7)) as CardOffer
    await cards.dismissOffer(shop, offer.id, true)
    expect((await store.settings()).neverSave).toContain('shop.example.com')
    // The site is not asked about at all now, and the card is not either after the setting is on.
    await store.setSettings({ neverSave: [] })
    expect(await store.cardOffer(7)).toBeNull()
  })
})

describe('what the browser remembers', () => {
  it('drops a fingerprint that is older than 180 days', async () => {
    const day = 86_400_000
    const old = { at: Date.now() - 181 * day, why: 'saved' }
    const fresh = { at: Date.now() - 179 * day, why: 'filled' }
    local.set('known', { ['a'.repeat(64)]: old, ['b'.repeat(64)]: fresh })
    expect(await known.isKnown('b'.repeat(64))).toBe(true)
    expect(await known.isKnown('a'.repeat(64))).toBe(false)
    // The old one is not written back to the storage either.
    await known.remember('c'.repeat(64), 'declined')
    const book = local.get('known') as Record<string, { at: number; why: string }>
    expect(Object.keys(book).sort()).toEqual(['b'.repeat(64), 'c'.repeat(64)])
    expect(book['c'.repeat(64)]?.why).toBe('declined')
  })

  it('keeps at most 2000 fingerprints, and lets the oldest go', async () => {
    const now = Date.now()
    const many = Object.fromEntries(
      Array.from({ length: 2500 }, (_, i) => [
        String(i).padStart(64, '0'),
        { at: now - (2500 - i) * 1000, why: 'saved' },
      ]),
    )
    local.set('known', many)
    await known.remember('c'.repeat(64), 'declined')
    const book = local.get('known') as Record<string, { at: number }>
    expect(Object.keys(book)).toHaveLength(known.MAX)
    expect(book['c'.repeat(64)]).toBeDefined()
    // The 501 oldest went first.
    expect(book['0'.repeat(64)]).toBeUndefined()
    expect(book['500'.padStart(64, '0')]).toBeUndefined()
    expect(book['501'.padStart(64, '0')]).toBeDefined()
  })

  it('does not put a password, a card number or a user name in the storage', async () => {
    const page = tabAt(SIGNIN)
    await actions.candidate(page, SIGNIN, 'kept@example.com', 'never stored here', 'Sign in')
    const shop = tabAt(SHOP)
    await cards.candidate(shop, SHOP, typedCard('4111111111111111'))
    const dumped = JSON.stringify([...local.entries()])
    expect(dumped).not.toContain('never stored here')
    expect(dumped).not.toContain('4111111111111111')
    expect(dumped).not.toContain('kept@example.com')
    expect(local.has('knownSecret')).toBe(true)
  })

  it('forgets every fingerprint when the person unpairs, and keeps no secret', async () => {
    const page = tabAt(SIGNIN)
    await actions.candidate(page, SIGNIN, 'pairing@example.com', 'a password to forget', '')
    expect(local.has('known')).toBe(true)
    const phone = await store.currentPhone()
    if (!phone) throw new Error('no phone')
    await agent.unpair(phone.phone_id)
    expect(local.has('known')).toBe(false)
    expect(local.has('knownSecret')).toBe(false)
    expect(await known.isKnown('b'.repeat(64))).toBe(false)
    // Pair again: the rest of the file asks the phone, and a new secret starts a new book.
    const { code } = await agent.startPairing('Test browser')
    const paired = await agent.finishPairing(code)
    if (!paired) throw new Error('no pairing after the unpair')
    await agent.rememberPhone(paired)
  })
})
