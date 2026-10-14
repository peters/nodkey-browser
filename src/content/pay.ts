/**
 * Paying with a card from Nodkey in a checkout page: the panel with the amount, the fill once
 * the phone approved, the watch on the total until the order is sent, and the offer to save a
 * card the person typed. The card is filled into the page and never kept here.
 */

import type { CardFillResult, CardOffer, ToBackground, ToContent } from '../models/messages'
import { t, uiLanguage } from '../i18n/t'
import { type Money, exceeds, formatMoney } from '../utils/money'
import { belongsTo, mayFill } from '../utils/site'
import {
  type CardFields,
  clearCard,
  fillCard,
  findCard,
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

/** Opens the payment card for the card field `field`. */
export function startPay(field: HTMLInputElement, ui: PageUi, send: Send): void {
  if (!mayFill(location.href)) return
  const total = findTotal(document)
  ui.showPay(
    {
      site: location.hostname.replace(/^www\./, ''),
      total: total?.amount ?? null,
      shown: total ? formatMoney(total.amount, uiLanguage()) : null,
      totalText: total?.text ?? null,
      totalElement: total?.element ?? null,
      currencies: currencies(),
    },
    (choice) => {
      if (!choice) return
      field.focus({ preventScroll: true })
      void send({ type: 'card.fill', ...choice })
    },
  )
}

/** The running watch on the total after a fill. */
let watch: { stop: () => void } | null = null

function watchTotal(fields: CardFields, approved: Money, send: Send): void {
  watch?.stop()
  const started = Date.now()
  const check = () => {
    if (Date.now() - started > 15 * 60_000) {
      stop()
      return
    }
    const now = findTotal(document)
    if (now && exceeds(now.amount, approved)) {
      clearCard(fields)
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

/**
 * Fills the card the phone approved, after reading the total again: never when the page now
 * shows more than the person approved. Then watches the total until the order is sent.
 */
export function cardFill(
  msg: Extract<ToContent, { type: 'card.fill' }>,
  send: Send,
): CardFillResult {
  if (!belongsTo(location.href, msg.site) || !mayFill(location.href)) {
    return { filled: false, reason: 'other_site' }
  }
  const active = document.activeElement
  const fields = findCard(document, undefined, active instanceof HTMLInputElement ? active : null)
  if (!fields) return { filled: false, reason: 'no_field' }
  const total = findTotal(document)
  if (total && exceeds(total.amount, msg.approved)) return { filled: false, reason: 'total_higher' }
  fillCard(fields, msg.card)
  watchTotal(fields, msg.approved, send)
  return { filled: true }
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
