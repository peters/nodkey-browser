/**
 * The payment card Nodkey shows in a checkout page (inside the closed shadow root of `ui.ts`):
 * the amount and the shop, where the amount comes from, and "Approve on iPhone". When the page
 * shows no total, the person types the amount.
 */

import { t } from '../i18n/t'
import type { Money } from '../utils/money'
import { readNumber } from './total'

export interface PayView {
  /** The site the card is for. */
  site: string
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

/** What the person chose: the amount to approve, or `null` (closed). */
export type PayChoice = {
  amount: Money
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

/** Builds the card's content into `card`; returns the element to focus. */
export function buildPayCard(
  card: HTMLElement,
  view: PayView,
  choose: (choice: PayChoice) => void,
): HTMLElement {
  const approve = el('button', 'primary', t('cardApprove'))
  approve.type = 'button'
  const error = el('p', 'muted')
  error.setAttribute('role', 'alert')
  let read: () => PayChoice = () => null

  if (view.total && view.shown) {
    const total = view.total
    card.append(
      el('p', 'amount', t('cardPayTitle', view.shown)),
      el('p', 'muted', t('cardPayAt', view.site)),
      el('p', 'found', t('cardTotalRead', view.totalText ?? view.shown)),
    )
    read = () => ({ amount: total, pageTotal: total, totalSource: 'page' })
  } else {
    const amount = el('input', '')
    amount.inputMode = 'decimal'
    amount.setAttribute('aria-label', t('cardAmountLabel'))
    amount.placeholder = t('cardAmountLabel')
    const currency = el('select', '')
    currency.setAttribute('aria-label', t('cardCurrencyLabel'))
    for (const c of view.currencies) currency.append(new Option(c, c))
    const row = el('div', 'typed')
    row.append(amount, currency)
    card.append(
      el('p', 'text', t('cardTotalMissing')),
      el('p', 'muted', t('cardPayAt', view.site)),
      row,
    )
    read = () => {
      const value = readNumber(amount.value)
      if (!value || Number(value) <= 0) return null
      const m = { value, currency: currency.value }
      return { amount: m, pageTotal: m, totalSource: 'user' }
    }
  }
  approve.addEventListener('click', (e) => {
    if (!e.isTrusted) return
    const choice = read()
    if (!choice) {
      error.textContent = t('cardAmountInvalid')
      return
    }
    choose(choice)
  })
  const row = el('div', 'row')
  row.append(approve)
  card.append(row, error, el('p', 'muted', t('cardNotStored')))
  return view.total ? approve : (card.querySelector('input') ?? approve)
}
