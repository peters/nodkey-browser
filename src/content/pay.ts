/**
 * Paying with a card from Nodkey in a checkout page, or adding it for later payments: the panel
 * in the top page with the amount (or the choice when the page shows no total), the fill once the
 * phone approved (also into a payment provider's frame below the page), the watch on the total
 * until the order is sent, and the offer to save a card the person typed. The card is filled into
 * the page and never kept here.
 */

import type { CardFillResult, CardOffer, ToBackground, ToContent } from '../models/messages'
import { t, uiLanguage } from '../i18n/t'
import { type Money, exceeds, formatMoney } from '../utils/money'
import { mayFill } from '../utils/site'
import {
  type CardFields,
  clearCard,
  fillCard,
  fillParts,
  findCard,
  findCardParts,
  isCardNumberField,
  typedCard,
} from './cards'
import { findTotal, krCurrency } from './total'
import type { PageUi } from './ui'

type Send = <T>(msg: ToBackground) => Promise<T | null>

const COMMON = ['NOK', 'SEK', 'DKK', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'KRW', 'CNY', 'BRL']

export function isCardField(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && isCardNumberField(el)
}

/** Currencies to offer when the person types the amount, the likely one first. */
function currencies(): string[] {
  const likely =
    krCurrency(document.documentElement.lang, location.hostname) ??
    krCurrency(uiLanguage(), '') ??
    (uiLanguage().startsWith('en-US') ? 'USD' : 'EUR')
  return [likely, ...COMMON.filter((c) => c !== likely)]
}

/**
 * Opens the payment card in the top page: for the card field `field` of this page, or, with
 * `ask`, for a card field in a frame below it (`via` its host when it is another site).
 */
export function startPay(
  field: HTMLInputElement | null,
  ui: PageUi,
  send: Send,
  ask: { ticket: string; via: string | null } | null = null,
): void {
  if (!mayFill(location.href) || window !== window.top) return
  const total = findTotal(document)
  ui.showPay(
    {
      site: location.hostname.replace(/^www\./, ''),
      via: ask?.via ?? null,
      total: total?.amount ?? null,
      shown: total ? formatMoney(total.amount, uiLanguage()) : null,
      totalText: total?.text ?? null,
      totalElement: total?.element ?? null,
      currencies: currencies(),
    },
    (choice) => {
      if (!choice) return
      field?.focus({ preventScroll: true })
      const msg: ToBackground = { type: 'card.fill', ...choice }
      if (ask) msg.ticket = ask.ticket
      void send(msg)
    },
  )
}

/** The running watch on the total after a fill. */
let watch: { stop: () => void } | null = null

/**
 * Reads the total every 0.7 seconds until the order is sent, the page goes or 15 minutes pass.
 * When it goes up past `approved`, empties `fields` (when the card is in this page) and tells
 * the background, which empties the card in frames below the page.
 */
export function watchTotal(fields: CardFields | null, approved: Money, send: Send): void {
  watch?.stop()
  const started = Date.now()
  const check = () => {
    if (Date.now() - started > 15 * 60_000) {
      stop()
      return
    }
    const now = findTotal(document)
    if (now && exceeds(now.amount, approved)) {
      if (fields) clearCard(fields)
      stop()
      void send({ type: 'card.cleared', total: now.amount })
    }
  }
  const timer = window.setInterval(check, 700)
  // Sending the order ends the watch: the page leaves, or the form is submitted.
  const onSubmit = () => {
    check()
    stop()
  }
  document.addEventListener('submit', onSubmit, true)
  window.addEventListener('pagehide', stop)
  function stop() {
    window.clearInterval(timer)
    document.removeEventListener('submit', onSubmit, true)
    window.removeEventListener('pagehide', stop)
    watch = null
  }
  watch = { stop }
}

/** The top page's total now, for a fill in a frame below it. */
export function totalNow(): Money | null {
  return window === window.top ? (findTotal(document)?.amount ?? null) : null
}

/**
 * Fills the card the phone approved into this frame, when it is still on the origin the request
 * named. For a payment, it reads the total again first: never when the page now shows more than
 * the person approved. Then it watches the total until the order is sent. A card for later
 * payments (`approved: null`) has no total.
 */
export function cardFill(
  msg: Extract<ToContent, { type: 'card.fill' }>,
  send: Send,
): CardFillResult {
  if (location.origin !== msg.origin || !mayFill(location.href)) {
    return { filled: false, reason: 'other_site' }
  }
  const active = document.activeElement
  const fields = findCard(document, undefined, active instanceof HTMLInputElement ? active : null)
  if (!fields) return { filled: false, reason: 'no_field' }
  const total = msg.approved ? findTotal(document) : null
  if (total && msg.approved && exceeds(total.amount, msg.approved)) {
    return { filled: false, reason: 'total_higher' }
  }
  fillCard(fields, msg.card)
  if (msg.approved) watchTotal(fields, msg.approved, send)
  return { filled: true }
}

/** The card's other parts, for a frame of the payment provider without a number field. */
export function cardParts(msg: Extract<ToContent, { type: 'card.parts' }>): void {
  if (location.origin !== msg.origin || !mayFill(location.href)) return
  if (findCard(document)) return
  const parts = findCardParts(document)
  if (parts) fillParts(parts, msg.card)
}

/** The total went up after a fill: this frame of the payment provider empties its card fields. */
export function cardClear(msg: Extract<ToContent, { type: 'card.clear' }>): void {
  if (location.origin !== msg.origin) return
  const fields = findCard(document) ?? findCardParts(document)
  if (fields) clearCard(fields)
}

/**
 * A form with a card the person typed was sent: hands the card to the background, which seals it
 * to the phone at once. True when there was a card (then it is not a login).
 */
export function cardSubmitted(scope: ParentNode, send: Send): boolean {
  const root = scope instanceof Document ? scope : (scope as Element).ownerDocument
  const fields = findCard(root)
  if (!fields) return false
  if (scope !== root && !(scope as Element).contains(fields.number)) return false
  const card = typedCard(fields)
  if (!card) return false
  void send({ type: 'card.candidate', url: location.href, ...card })
  return true
}

const BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  maestro: 'Maestro',
}

export function askCardSave(offer: CardOffer, ui: PageUi, send: Send): void {
  const name = `${BRANDS[offer.brand] ?? t('cardGeneric')} ····${offer.last4}`
  ui.askSaveCard(offer, name, (choice) => {
    if (choice === 'save') void send({ type: 'card.accept', id: offer.id })
    else void send({ type: 'card.dismiss', id: offer.id, never: choice === 'never' })
  })
}
