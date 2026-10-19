// @vitest-environment node
/**
 * Payment cards in the real background code against nodkey-cli's fake relay and phone, which
 * holds the test card 4242 4242 4242 4242 and answers by the person's card settings. The pages
 * are a stand-in `chrome.tabs.sendMessage` that records what a frame would get.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useKeyStore } from '../../src/background/keys'
import type { Activity, CardOffer, ToBackground, ToContent } from '../../src/models/messages'
import { installFakeChrome, loadWasm, memoryKeyStore } from './fake-chrome'

const BIN = 'target/debug/nodkey-fake-relay'
const SHOP = 'https://www.shop.example.com/checkout'
let relay: ChildProcess | undefined
let base = ''
let session: Map<string, unknown>
/** What the frame of the test page answers to `card.fill`, and every message it got. */
let frameReply: unknown = { filled: true }
/** What the top page answers to `card.total`. */
let totalReply: unknown = null
let toPage: ToContent[] = []
/** The frame of each message in `toPage` (`undefined`: every frame of the tab). */
let frames: (number | undefined)[] = []

async function control(path: string, body: unknown): Promise<void> {
  await fetch(base + path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function seen(): Promise<{ request: Record<string, unknown>; saved_card: string | null }[]> {
  return (await (await fetch(`${base}/_fake/seen`)).json()) as {
    request: Record<string, unknown>
    saved_card: string | null
  }[]
}

const tab = { id: 7, windowId: 1, url: SHOP } as chrome.tabs.Tab

function activity(): Activity | undefined {
  return session.get('activity:7') as Activity | undefined
}

type FillMsg = Extract<ToBackground, { type: 'card.fill' }>
const nok = (value: string) => ({ value, currency: 'NOK' })
const fillMsg = (amount: string, total: string | null = amount): FillMsg => ({
  type: 'card.fill',
  purpose: 'pay',
  amount: nok(amount),
  pageTotal: total === null ? null : nok(total),
  totalSource: 'page',
})

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
  session = installFakeChrome().session
  const fake = globalThis as unknown as {
    chrome: { tabs: Record<string, unknown> }
  }
  fake.chrome.tabs.sendMessage = (
    _tabId: number,
    msg: ToContent,
    options?: { frameId?: number },
  ) => {
    toPage.push(msg)
    frames.push(options?.frameId)
    if (msg.type === 'card.total') return Promise.resolve(totalReply)
    return Promise.resolve(msg.type === 'card.fill' ? frameReply : undefined)
  }
  fake.chrome.tabs.captureVisibleTab = () => Promise.reject(new Error('no screen in a test'))
  loadWasm()
  useKeyStore(memoryKeyStore())
  const store = await import('../../src/background/store')
  await store.setSettings({ relay: base })
  const agent = await import('../../src/background/agent')
  const { code } = await agent.startPairing('Test browser')
  const phone = await agent.finishPairing(code)
  if (!phone) throw new Error('no pairing')
  await agent.rememberPhone(phone)
})

afterAll(() => {
  relay?.kill()
})

beforeEach(async () => {
  frameReply = { filled: true }
  totalReply = null
  toPage = []
  frames = []
  await control('/_fake/cards', { enabled: true, reveal: false, limit: nok('1000.00') })
  await control('/_fake/mode', 'approve')
})

describe('payment cards against the fake phone', () => {
  it('fills a card for one purchase and tells only the brand and last digits', async () => {
    const cards = await import('../../src/background/cards')
    await cards.fill(tab, 0, SHOP, fillMsg('499,00', '499,00'))
    const fill = toPage.find((m) => m.type === 'card.fill')
    expect(fill?.type === 'card.fill' && fill.card.number).toBe('4242424242424242')
    expect(fill?.type === 'card.fill' && fill.approved).toEqual(nok('499.00'))
    expect(activity()?.state).toBe('approved')
    expect(activity()?.message).toContain('Visa ····4242')
    expect(activity()?.message).not.toContain('4242424242424242')
    const request = (await seen()).at(-1)?.request as {
      kind: string
      card: Record<string, unknown>
    }
    expect(request.kind).toBe('card')
    expect(request.card).toEqual({
      mode: 'fill',
      merchant: 'shop.example.com',
      amount: nok('499.00'),
      origin: 'https://www.shop.example.com',
      page_total: nok('499.00'),
      total_source: 'page',
    })
  })

  it('refuses before asking when the page total is higher', async () => {
    const cards = await import('../../src/background/cards')
    const before = (await seen()).length
    await cards.fill(tab, 0, SHOP, fillMsg('499', '4999'))
    expect(activity()?.state).toBe('denied')
    expect(activity()?.message).toContain('higher')
    expect((await seen()).length).toBe(before)
  })

  it('shows the phone refusals: over the limit, cards off, denied', async () => {
    const cards = await import('../../src/background/cards')
    await cards.fill(tab, 0, SHOP, fillMsg('12999'))
    expect(activity()?.message).toContain('above your limit')
    await control('/_fake/cards', { enabled: false, reveal: false, limit: null })
    await cards.fill(tab, 0, SHOP, fillMsg('499'))
    expect(activity()?.message).toContain('Cards are off')
    await control('/_fake/cards', { enabled: true, reveal: false, limit: null })
    await control('/_fake/mode', 'deny')
    await cards.fill(tab, 0, SHOP, fillMsg('499'))
    expect(activity()?.message).toBe('The payment was not approved.')
    expect(toPage.some((m) => m.type === 'card.fill')).toBe(false)
  })

  it('reports a page whose total went up before the fill', async () => {
    const cards = await import('../../src/background/cards')
    frameReply = { filled: false, reason: 'total_higher' }
    await cards.fill(tab, 0, SHOP, fillMsg('499'))
    expect(activity()?.state).toBe('denied')
    expect(activity()?.message).toContain('did not fill in the card')
  })

  it('fills a frame of another site only through the top page, and only over HTTPS', async () => {
    const cards = await import('../../src/background/cards')
    const before = (await seen()).length
    await cards.fill(tab, 3, 'https://js.payments.example.net/frame', fillMsg('499'))
    expect(activity()?.message).toBe('Click the Nodkey button in the card field again.')
    expect((await seen()).length).toBe(before)
    await cards.fill(
      { ...tab, url: 'http://shop.example.com/' },
      0,
      'http://shop.example.com/',
      fillMsg('1'),
    )
    expect(activity()?.message).toContain('HTTPS')
  })

  it('adds a card for later payments without an amount', async () => {
    const cards = await import('../../src/background/cards')
    await cards.fill(tab, 0, SHOP, {
      type: 'card.fill',
      purpose: 'setup',
      amount: null,
      pageTotal: null,
      totalSource: 'user',
    })
    const fill = toPage.find((m) => m.type === 'card.fill')
    expect(fill).toMatchObject({ origin: 'https://www.shop.example.com', approved: null })
    expect(activity()?.message).toBe(
      'Visa ····4242 filled in to add it for later payments. No payment was approved.',
    )
    const request = (await seen()).at(-1)?.request as { card: Record<string, unknown> }
    expect(request.card).toEqual({
      mode: 'fill',
      purpose: 'setup',
      merchant: 'shop.example.com',
      origin: 'https://www.shop.example.com',
    })
    // Off on the phone for this browser: a calm note.
    await control('/_fake/cards', { enabled: true, reveal: false, setup: false, limit: null })
    await cards.fill(tab, 0, SHOP, {
      type: 'card.fill',
      purpose: 'setup',
      amount: null,
      pageTotal: null,
      totalSource: 'user',
    })
    expect(activity()?.message).toContain('Adding cards for later payments is off')
  })

  it('pays into a payment frame of another site, named as via, from the top page', async () => {
    const cards = await import('../../src/background/cards')
    const FRAME = 'https://js.pay.example/elements/card'
    await cards.start(tab, 5, FRAME)
    const ask = toPage.find((m) => m.type === 'card.ask')
    expect(ask).toMatchObject({ type: 'card.ask', via: 'js.pay.example' })
    expect(frames.at(-1)).toBe(0)
    const ticket = ask?.type === 'card.ask' ? ask.ticket : ''
    totalReply = null
    await cards.fill(tab, 0, SHOP, { ...fillMsg('250', '250'), totalSource: 'user', ticket })
    const request = (await seen()).at(-1)?.request as { card: Record<string, unknown> }
    expect(request.card).toEqual({
      mode: 'fill',
      merchant: 'shop.example.com',
      via: 'js.pay.example',
      amount: nok('250'),
      origin: 'https://js.pay.example',
      page_total: nok('250'),
      total_source: 'user',
    })
    // The top page read its total again, the frame got the card, the other frames of the
    // provider the parts, and the top page watches the total.
    const kinds = toPage.map((m, i) => `${m.type}@${String(frames[i])}`)
    expect(kinds).toEqual([
      'card.ask@0',
      'activity@0',
      'card.total@0',
      'card.fill@5',
      'card.parts@undefined',
      'card.watch@0',
      'activity@0',
    ])
    const parts = toPage.find((m) => m.type === 'card.parts')
    expect(JSON.stringify(parts)).not.toContain('4242424242424242')
    expect(activity()?.state).toBe('approved')

    // The total goes up: the frames of the provider empty their card fields.
    await cards.cleared(tab, 0, SHOP, nok('300'))
    expect(toPage.at(-2)).toEqual({ type: 'card.clear', origin: 'https://js.pay.example' })

    // A ticket counts once; a higher total in the top page stops the fill.
    await cards.fill(tab, 0, SHOP, { ...fillMsg('250'), ticket })
    expect(activity()?.message).toBe('Click the Nodkey button in the card field again.')
    await cards.start(tab, 5, FRAME)
    const again = toPage.findLast((m) => m.type === 'card.ask')
    totalReply = nok('900')
    toPage = []
    await cards.fill(tab, 0, SHOP, {
      ...fillMsg('250', null),
      ticket: again?.type === 'card.ask' ? again.ticket : '',
    })
    expect(activity()?.message).toContain('higher')
    expect(toPage.some((m) => m.type === 'card.fill')).toBe(false)
  })

  it('offers to save a typed card, sealed at once, and the phone opens it', async () => {
    const cards = await import('../../src/background/cards')
    const store = await import('../../src/background/store')
    await cards.candidate(tab, SHOP, {
      type: 'card.candidate',
      url: SHOP,
      number: '5555555555554444',
      exp_month: 12,
      exp_year: 2030,
      cvc: '321',
      holder: 'Alex Example',
    })
    const offer = (await store.cardOffer(7)) as CardOffer
    expect(offer.brand).toBe('mastercard')
    expect(offer.last4).toBe('4444')
    expect(JSON.stringify(offer)).not.toContain('5555555555554444')
    expect(await cards.takeOffer(tab, SHOP)).toEqual(offer)
    expect(await cards.takeOffer(tab, SHOP)).toBeNull()
    await cards.acceptOffer(tab, offer.id)
    expect(activity()?.message).toBe('The card is saved in Nodkey on your iPhone.')
    const last = (await seen()).at(-1)
    expect(last?.request.kind).toBe('save')
    expect(last?.saved_card).toBe('5555555555554444')

    // A card Nodkey just filled, or a number that fails the Luhn check, is not offered.
    await cards.fill(tab, 0, SHOP, fillMsg('10'))
    for (const number of ['4242424242424242', '4242424242424241']) {
      await cards.candidate(tab, SHOP, {
        type: 'card.candidate',
        url: SHOP,
        number,
        exp_month: 1,
        exp_year: 2031,
      })
      expect(await store.cardOffer(7)).toBeNull()
    }
  })
})
