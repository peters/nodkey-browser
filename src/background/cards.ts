/**
 * Payment cards: fill a checkout form with a card from the phone for one purchase, and offer to
 * save a card the person typed. A card request always names the shop and the amount
 * (`kind: card`, `mode: fill`); the phone answers only after Face ID, never under a lease.
 * The card passes through memory on its way into the page and is never stored or logged.
 */

import {
  card_brand,
  card_last4,
  card_luhn,
  check_card,
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

/**
 * Asks the phone for a card to pay `msg.amount` at the shop in `frameUrl`, and sends it to that
 * frame. The origin comes from the browser (the frame's address), never from the page.
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
  const say = (state: Parameters<typeof publish>[3], message: string) =>
    publish(tabId, 'card', merchant, state, message, frameId)
  if (!merchant || !mayFill(frameUrl)) return say('error', t('cardInsecure'))
  if (!belongsTo(frameUrl, merchant)) return say('error', t('cardOtherSite'))
  const phone = await store.currentPhone()
  if (!phone) return say('error', t('actNeedsPairing'))
  let amount: Money
  let pageTotal: Money | null
  try {
    amount = parseMoney(JSON.parse(parse_money(msg.amount.value, msg.amount.currency)))
    pageTotal = msg.pageTotal
      ? parseMoney(JSON.parse(parse_money(msg.pageTotal.value, msg.pageTotal.currency)))
      : null
  } catch {
    return say('error', t('cardAmountInvalid'))
  }
  const card: Record<string, unknown> = {
    mode: 'fill',
    merchant,
    amount,
    origin: new URL(frameUrl).origin,
  }
  if (pageTotal) {
    card.page_total = pageTotal
    card.total_source = msg.totalSource
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
  await say('waiting', t('cardWaiting', show(amount)))
  try {
    const settings = await store.settings()
    const picture = settings.screenshots ? await capture(tab.windowId, merchant) : null
    const reason = t('reasonCard', show(amount), merchant, info.browser)
    const { answer } = await ask(
      { kind: 'card', site: merchant, reason, picture, card, client: client() },
      phone,
    )
    if (answer?.decision !== 'approved' || !answer.card) {
      const shown = cardRefusal(answer)
      await say(shown.state, shown.message)
      return
    }
    const c = answer.card
    const filled: CardToFill = { number: c.number, exp_month: c.exp_month, exp_year: c.exp_year }
    if (c.cvc !== undefined) filled.cvc = c.cvc
    if (c.holder !== undefined) filled.holder = c.holder
    const toFill: ToContent = {
      type: 'card.fill',
      site: merchant,
      card: filled,
      approved: c.approved_amount,
    }
    recentFills.set(await numberKey(c.number), Date.now())
    const result = (await chrome.tabs
      .sendMessage(tabId, toFill, { frameId })
      .catch(() => null)) as CardFillResult | null
    if (result?.filled === true) {
      await say('approved', t('cardFilled', cardName(c.brand, c.last4), show(c.approved_amount)))
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

/** The page's total went up after Nodkey filled the card; the frame emptied the card fields. */
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
  await publish(tab.id, 'card', siteOf(frameUrl) ?? '', 'error', t('cardTotalRose', shown), frameId)
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
