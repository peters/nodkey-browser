/**
 * The payment card Nodkey shows in a checkout page (inside the closed shadow root of `ui.ts`):
 * the amount and the shop (and the payment frame, "via ..."), where the amount comes from, and
 * "Approve on iPhone". When the page shows no total, the person chooses: add the card for later
 * payments, or type the amount to pay.
 */

import { t } from '../i18n/t'
import type { Money } from '../utils/money'
import { readNumber } from './total'

export interface PayView {
  /** The site the card is for: the top page's site. */
  site: string
  /** The host of the payment frame of another site that holds the card fields, or `null`. */
  via: string | null
  /** The total read from the page, or `null` when the person types it. */
  total: Money | null
  /** The total as the person reads it ("499,00 kr"). */
  shown: string | null
  /** The page text it was read from. */
  totalText: string | null
  totalElement: HTMLElement | null
  /** Currencies offered when the person types the amount, the likely one first. */
  currencies: string[]
}

/**
 * What the person chose: an amount to pay, the card for later payments (`setup`, no amount), or
 * `null` (closed).
 */
export type PayChoice = {
  purpose: 'pay' | 'setup'
  amount: Money | null
  pageTotal: Money | null
  totalSource: 'page' | 'user'
} | null

export const payCss = `
.amount { font: 800 28px/1.05 system-ui, sans-serif; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; margin: 0; }
.found { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 12.5px; }
.found::before { content: "\\2713"; color: var(--accent); font-weight: 700; }
.typed { display: flex; gap: 8px; }
.typed input, .typed select {
  font: 16px system-ui, sans-serif; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--rule);
  background: var(--bg); color: var(--ink); min-width: 0;
}
.typed input { flex: 1; }
.ring {
  position: fixed; border: 3px dashed var(--accent); border-radius: 8px; pointer-events: none;
  box-sizing: border-box;
}
`

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

/** "at shop.example.com", and "via js.pay.example" for a payment frame of another site. */
function where(view: PayView): HTMLElement[] {
  const out = [el('p', 'muted', t('cardPayAt', view.site))]
  if (view.via) out.push(el('p', 'muted', t('cardVia', view.via)))
  return out
}

/** Builds the card's content into `card`; returns the element to focus. */
export function buildPayCard(
  card: HTMLElement,
  view: PayView,
  choose: (choice: PayChoice) => void,
): HTMLElement {
  const error = el('p', 'muted')
  error.setAttribute('role', 'alert')
  const button = (label: string, cls: string, onClick: () => void) => {
    const b = el('button', cls, label)
    b.type = 'button'
    b.addEventListener('click', (e) => {
      if (e.isTrusted) onClick()
    })
    return b
  }

  if (view.total && view.shown) {
    const total = view.total
    const approve = button(t('cardApprove'), 'primary', () => {
      choose({ purpose: 'pay', amount: total, pageTotal: total, totalSource: 'page' })
    })
    const row = el('div', 'row')
    row.append(approve)
    card.append(
      el('p', 'amount', t('cardPayTitle', view.shown)),
      ...where(view),
      el('p', 'found', t('cardTotalRead', view.totalText ?? view.shown)),
      row,
      error,
      el('p', 'muted', t('cardNotStored')),
    )
    return approve
  }

  // No total on the page: a billing page or a subscription that adds the card for later, or a
  // checkout whose total Nodkey cannot read.
  const amount = el('input', '')
  amount.inputMode = 'decimal'
  amount.setAttribute('aria-label', t('cardAmountLabel'))
  amount.placeholder = t('cardAmountLabel')
  const currency = el('select', '')
  currency.setAttribute('aria-label', t('cardCurrencyLabel'))
  for (const c of view.currencies) currency.append(new Option(c, c))
  const typed = el('div', 'typed')
  typed.append(amount, currency)
  const payPart = el('div', '')
  payPart.hidden = true
  const pay = () => {
    const value = readNumber(amount.value)
    if (!value || Number(value) <= 0) {
      error.textContent = t('cardAmountInvalid')
      return
    }
    const m = { value, currency: currency.value }
    choose({ purpose: 'pay', amount: m, pageTotal: m, totalSource: 'user' })
  }
  const approve = button(t('cardApprove'), 'primary', pay)
  // Enter in the amount field approves too.
  amount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.isTrusted) pay()
  })
  const approveRow = el('div', 'row')
  approveRow.append(approve)
  payPart.append(el('p', 'text', t('cardTotalMissing')), typed, approveRow)

  const setup = button(t('cardSetupButton'), 'primary', () => {
    choose({ purpose: 'setup', amount: null, pageTotal: null, totalSource: 'user' })
  })
  const payAmount = button(t('cardPayAmountButton'), 'plain', () => {
    choices.hidden = true
    payPart.hidden = false
    amount.focus({ preventScroll: true })
  })
  const choices = el('div', 'row')
  choices.append(setup, payAmount)
  card.append(
    el('p', 'text', t('cardNoTotal')),
    ...where(view),
    choices,
    payPart,
    error,
    el('p', 'muted', t('cardNotStored')),
  )
  return setup
}
