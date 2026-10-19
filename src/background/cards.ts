/**
 * Payment cards: fill a checkout form with a card from the phone for one purchase, or add it to a
 * site for later payments, and offer to save a card the person typed. A card request always names
 * the shop of the top page, and a payment needs its amount (`kind: card`, `mode: fill`, ADR-0009
 * and ADR-0013); the phone answers only after Face ID, never under a lease.
 * The card passes through memory on its way into the page and is never stored or logged.
 */

import {
  card_brand,
  card_last4,
  card_luhn,
  check_card,
  money_exceeds,
  parse_money,
  random_id,
  seal_card_secret,
} from '../wasm/nodkey.js'
import type {
  CardFillResult,
  CardOffer,
  CardToFill,
  ToBackground,
  ToContent,
} from '../models/messages'
import { type Money, parseMoney, parseSealedBox } from '../models/protocol'
import { t, uiLanguage } from '../i18n/t'
import { formatMoney } from '../utils/money'
import { belongsTo, mayFill, siteOf } from '../utils/site'
import { info, client, publish } from './actions'
import { ask } from './agent'
import { cardRefusal, failed } from './outcome'
import { capture } from './screenshot'
import * as store from './store'

type FillMsg = Extract<ToBackground, { type: 'card.fill' }>
type CandidateMsg = Extract<ToBackground, { type: 'card.candidate' }>

const show = (m: Money) => formatMoney(m, uiLanguage())

/** "Visa ····4242" */
export function cardName(brand: string, last4: string): string {
  const names: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    maestro: 'Maestro',
  }
  return `${names[brand] ?? t('cardGeneric')} ····${last4}`
}

/** Hashes of card numbers Nodkey filled in the last ten minutes: not offered for saving again. */
const recentFills = new Map<string, number>()

async function numberKey(number: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(number))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A card field in a frame below the top page, waiting for the person's choice in the top page. */
interface Ticket {
  tabId: number
  frameId: number
  url: string
  at: number
}

/** By ticket id; a ticket counts for 5 minutes and once. */
const tickets = new Map<string, Ticket>()

/** The frame origin of the latest paid fill in a frame below the top page, by tab. */
const framed = new Map<number, string>()

/** Whether `host` is the merchant's site or below it (else the card form is in a payment frame). */
function onSite(host: string, merchant: string): boolean {
  return host === merchant || host.endsWith(`.${merchant}`)
}

/**
 * A card field in a frame below the top page was clicked: the top page shows the payment card,
 * so the person sees the shop of the address bar and reads the total there. A frame from another
 * site (a payment provider's frame) is named as "via <host>".
 */
export async function start(tab: chrome.tabs.Tab, frameId: number, frameUrl: string) {
  const tabId = tab.id
  if (tabId === undefined || frameId === 0) return
  const merchant = siteOf(tab.url ?? '')
  if (!merchant || !mayFill(tab.url ?? '') || !mayFill(frameUrl)) {
    await publish(tabId, 'card', merchant ?? '', 'error', t('cardInsecure'), 0)
    return
  }
  for (const [id, old] of tickets) {
    if (old.tabId === tabId || Date.now() - old.at > 5 * 60_000) tickets.delete(id)
  }
  const ticket = random_id()
  tickets.set(ticket, { tabId, frameId, url: frameUrl, at: Date.now() })
  const host = new URL(frameUrl).hostname.toLowerCase()
  const ask: ToContent = { type: 'card.ask', ticket, via: onSite(host, merchant) ? null : host }
  await chrome.tabs.sendMessage(tabId, ask, { frameId: 0 }).catch(() => undefined)
}

/** The frame a card goes into: the one that asked through a ticket, or the sender itself. */
function target(
  tabId: number,
  frameId: number,
  frameUrl: string,
  ticket: string | undefined,
): { frameId: number; url: string } | null {
  if (ticket === undefined) return { frameId, url: frameUrl }
  const t = tickets.get(ticket)
  tickets.delete(ticket)
  // Only the top page answers a ticket, for its own tab, within 5 minutes.
  if (!t || t.tabId !== tabId || frameId !== 0 || Date.now() - t.at > 5 * 60_000) return null
  return { frameId: t.frameId, url: t.url }
}

/**
 * Asks the phone for a card at the shop of the tab, and sends it to the frame of the card form:
 * to pay `msg.amount` (`purpose: pay`), or to add the card for later payments without an amount
 * (`purpose: setup`). The merchant is the top page's site; a card form in a frame of another
 * site goes as `via` its host. Origins come from the browser (the frames' addresses), never from
 * the page.
 */
export async function fill(
  tab: chrome.tabs.Tab,
  frameId: number,
  frameUrl: string,
  msg: FillMsg,
): Promise<void> {
  const tabId = tab.id
  if (tabId === undefined) return
  const merchant = siteOf(tab.url ?? frameUrl) ?? ''
  // A card for a frame below the top page: the top page shows what happens.
  const shownIn = msg.ticket === undefined ? frameId : 0
  const say = (state: Parameters<typeof publish>[3], message: string) =>
    publish(tabId, 'card', merchant, state, message, shownIn)
  const into = target(tabId, frameId, frameUrl, msg.ticket)
  if (!into) return say('error', t('cardAskAgain'))
  if (!merchant || !mayFill(tab.url ?? '') || !mayFill(into.url)) {
    return say('error', t('cardInsecure'))
  }
  const host = new URL(into.url).hostname.toLowerCase()
  const via = onSite(host, merchant) ? null : host
  // A frame of another site asks through the top page (a ticket), never by itself.
  if (via && msg.ticket === undefined) return say('error', t('cardAskAgain'))
  const phone = await store.currentPhone()
  if (!phone) return say('error', t('actNeedsPairing'))
  const setup = msg.purpose === 'setup'
  const origin = new URL(into.url).origin
  const card: Record<string, unknown> = { mode: 'fill', merchant, origin }
  if (setup) card.purpose = 'setup'
  if (via) card.via = via
  let amount: Money | null = null
  if (!setup) {
    try {
      if (!msg.amount) throw new Error('no amount')
      amount = parseMoney(JSON.parse(parse_money(msg.amount.value, msg.amount.currency)))
      const pageTotal = msg.pageTotal
        ? parseMoney(JSON.parse(parse_money(msg.pageTotal.value, msg.pageTotal.currency)))
        : null
      card.amount = amount
      if (pageTotal) {
        card.page_total = pageTotal
        card.total_source = msg.totalSource
      }
    } catch {
      return say('error', t('cardAmountInvalid'))
    }
  }
  const checked = JSON.parse(check_card(JSON.stringify(card), merchant)) as {
    ok: boolean
    error?: string
  }
  if (!checked.ok) {
    return say(
      'denied',
      checked.error === 'total_mismatch' ? t('cardTotalHigher') : t('cardBadRequest'),
    )
  }
  await say('waiting', amount ? t('cardWaiting', show(amount)) : t('cardSetupWaiting'))
  try {
    const settings = await store.settings()
    const picture = settings.screenshots ? await capture(tab.windowId, merchant) : null
    const { answer } = await ask(
      {
        kind: 'card',
        site: merchant,
        reason: reason(merchant, via, amount),
        picture,
        card,
        client: client(),
      },
      phone,
    )
    const approved = answer?.card?.approved_amount ?? null
    if (answer?.decision !== 'approved' || !answer.card || (!setup && !approved)) {
      const shown = cardRefusal(answer, setup)
      await say(shown.state, shown.message)
      return
    }
    const c = answer.card
    // The top page shows the total for a frame below it: read it again before the fill.
    if (approved && msg.ticket !== undefined) {
      const now = (await chrome.tabs
        .sendMessage(tabId, { type: 'card.total' } satisfies ToContent, { frameId: 0 })
        .catch(() => null)) as Money | null
      if (now && money_exceeds(JSON.stringify(now), JSON.stringify(approved))) {
        await say('denied', t('cardTotalHigher'))
        return
      }
    }
    const filled: CardToFill = { number: c.number, exp_month: c.exp_month, exp_year: c.exp_year }
    if (c.cvc !== undefined) filled.cvc = c.cvc
    if (c.holder !== undefined) filled.holder = c.holder
    const toFill: ToContent = { type: 'card.fill', origin, card: filled, approved }
    recentFills.set(await numberKey(c.number), Date.now())
    const result = (await chrome.tabs
      .sendMessage(tabId, toFill, { frameId: into.frameId })
      .catch(() => null)) as CardFillResult | null
    if (result?.filled === true) {
      if (via) await fillParts(tabId, origin, filled)
      if (approved && msg.ticket !== undefined) {
        framed.set(tabId, origin)
        const watch: ToContent = { type: 'card.watch', approved }
        await chrome.tabs.sendMessage(tabId, watch, { frameId: 0 }).catch(() => undefined)
      }
      const name = cardName(c.brand, c.last4)
      await say(
        'approved',
        approved ? t('cardFilled', name, show(approved)) : t('cardSetupFilled', name),
      )
      return
    }
    const why = result?.filled === false ? result.reason : 'no_field'
    await say(
      why === 'total_higher' ? 'denied' : 'error',
      why === 'total_higher' ? t('cardTotalHigher') : t('cardNoField'),
    )
    return
  } catch (e) {
    const shown = failed(e)
    return say(shown.state, shown.message)
  }
}

/** What the phone shows as the reason: the shop, the payment frame and the amount. */
function reason(merchant: string, via: string | null, amount: Money | null): string {
  if (!amount) {
    return via
      ? t('reasonCardSetupVia', merchant, via, info.browser)
      : t('reasonCardSetup', merchant, info.browser)
  }
  return via
    ? t('reasonCardVia', show(amount), merchant, via, info.browser)
    : t('reasonCard', show(amount), merchant, info.browser)
}

/**
 * Payment providers may put the number, the expiry and the CVC in separate frames of one
 * origin. The frames of `origin` fill the parts they have; other frames ignore the message.
 */
async function fillParts(tabId: number, origin: string, card: CardToFill): Promise<void> {
  const parts: Omit<CardToFill, 'number'> = { exp_month: card.exp_month, exp_year: card.exp_year }
  if (card.cvc !== undefined) parts.cvc = card.cvc
  if (card.holder !== undefined) parts.holder = card.holder
  const msg: ToContent = { type: 'card.parts', origin, card: parts }
  await chrome.tabs.sendMessage(tabId, msg).catch(() => undefined)
}

/**
 * The page's total went up after Nodkey filled the card. A frame with the card fields emptied
 * them; for a card in frames below the top page, those frames empty theirs now.
 */
export async function cleared(
  tab: chrome.tabs.Tab,
  frameId: number | undefined,
  frameUrl: string,
  total: Money,
): Promise<void> {
  if (tab.id === undefined) return
  let shown = `${total.value} ${total.currency}`
  try {
    shown = show(parseMoney(total))
  } catch {
    // Shown as the page sent it.
  }
  const origin = framed.get(tab.id)
  if (origin && frameId === 0) {
    framed.delete(tab.id)
    const clear: ToContent = { type: 'card.clear', origin }
    await chrome.tabs.sendMessage(tab.id, clear).catch(() => undefined)
  }
  const site = siteOf(tab.url ?? frameUrl) ?? ''
  await publish(tab.id, 'card', site, 'error', t('cardTotalRose', shown), frameId)
}

/** A card the person submitted in a page: sealed to the phone at once, then offered for saving. */
export async function candidate(tab: chrome.tabs.Tab, frameUrl: string, msg: CandidateMsg) {
  const tabId = tab.id
  const site = siteOf(frameUrl)
  if (tabId === undefined || !site || !mayFill(frameUrl) || !card_luhn(msg.number)) return
  const settings = await store.settings()
  if (!settings.offerSave || settings.neverSave.includes(site)) return
  const filledAt = recentFills.get(await numberKey(msg.number))
  if (filledAt !== undefined && Date.now() - filledAt < 10 * 60_000) return
  const [agent, phone] = [await store.agent(), await store.currentPhone()]
  if (!agent || !phone) return
  const last4 = card_last4(msg.number)
  if (!last4) return
  const page = new URL(frameUrl)
  const offer: CardOffer = {
    id: random_id(),
    phoneId: phone.phone_id,
    site,
    url: page.origin + page.pathname,
    brand: card_brand(msg.number),
    last4,
    exp_month: msg.exp_month,
    exp_year: msg.exp_year,
    number: parseSealedBox(JSON.parse(seal_card_secret(agent.agent_id, phone.kem, msg.number))),
    at: Date.now(),
  }
  if (msg.cvc) {
    offer.cvc = parseSealedBox(JSON.parse(seal_card_secret(agent.agent_id, phone.kem, msg.cvc)))
  }
  if (msg.holder) offer.holder = msg.holder.slice(0, 100)
  await store.setCardOffer(tabId, offer)
}

/** The card save offer for a page that loaded in `tab`, once. */
export async function takeOffer(tab: chrome.tabs.Tab, frameUrl: string): Promise<CardOffer | null> {
  if (tab.id === undefined) return null
  const offer = await store.cardOffer(tab.id)
  if (!offer || offer.shown || !belongsTo(frameUrl, offer.site)) return null
  await store.setCardOffer(tab.id, { ...offer, shown: true })
  return offer
}

export async function acceptOffer(tab: chrome.tabs.Tab, id: string): Promise<void> {
  const tabId = tab.id
  if (tabId === undefined) return
  const offer = await store.cardOffer(tabId)
  if (offer?.id !== id) return
  await store.setCardOffer(tabId, null)
  const say = (state: Parameters<typeof publish>[3], message: string) =>
    publish(tabId, 'save', offer.site, state, message)
  const phone = (await store.phones()).find((p) => p.phone_id === offer.phoneId)
  if (!phone) return say('error', t('actNotPaired'))
  await say('waiting', t('saveWaiting'))
  const saveCard: Record<string, unknown> = {
    number: offer.number,
    exp_month: offer.exp_month,
    exp_year: offer.exp_year,
    url: offer.url,
    last4: offer.last4,
  }
  if (offer.cvc) saveCard.cvc = offer.cvc
  if (offer.holder) saveCard.holder = offer.holder
  try {
    const { answer } = await ask(
      {
        kind: 'save',
        site: offer.site,
        reason: t('reasonSaveCard', offer.site, info.browser),
        saveCard,
        client: client(),
      },
      phone,
    )
    if (answer?.decision === 'approved') {
      await say('approved', answer.saved === 'updated' ? t('cardSaveUpdated') : t('cardSaved'))
      return
    }
    if (!answer || answer.decision === 'expired') {
      await say('expired', t('actExpired'))
      return
    }
    await say('denied', t('cardSaveDenied'))
    return
  } catch (e) {
    const shown = failed(e)
    return say(shown.state, shown.message)
  }
}

export async function dismissOffer(tab: chrome.tabs.Tab, id: string, never: boolean) {
  if (tab.id === undefined) return
  const offer = await store.cardOffer(tab.id)
  if (offer?.id !== id) return
  await store.setCardOffer(tab.id, null)
  if (never) {
    const settings = await store.settings()
    if (!settings.neverSave.includes(offer.site)) {
      await store.setSettings({ neverSave: [...settings.neverSave, offer.site].sort() })
    }
  }
}
