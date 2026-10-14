/**
 * Finds the payment card fields of a checkout form, fills a card into them, clears them again,
 * and reads a card the person typed (to offer to save it). Pure DOM logic, tested with jsdom; the
 * limits are in docs/adr/0009-card-fill.md.
 */

import { setValue } from './fill'
import { type Visible, layoutVisible } from './forms'

type Field = HTMLInputElement | HTMLSelectElement

export interface CardFields {
  number: HTMLInputElement
  /** One field for month and year ("MM/YY"). */
  expiry: HTMLInputElement | null
  month: Field | null
  year: Field | null
  cvc: HTMLInputElement | null
  holder: HTMLInputElement | null
}

/** The card a phone sent, for filling. Kept only in memory, never stored. */
export interface Card {
  number: string
  exp_month: number
  exp_year: number
  cvc?: string
  holder?: string
}

const NUMBER =
  /card.?num|cc.?num|cardnumber|creditcard|kortnummer|kartennummer|numero.?de.?tarjeta|num[eé]ro.?de.?(la.?)?carte|numero.?(della.?)?carta|n[uú]mero.?do.?cart[aã]o|カード番号|카드.?번호|卡号/i
const EXPIRY =
  /exp(iry|iration|ires)?.?(date)?$|^exp|valid.?thru|mm.?\/.?(yy|åå|jj|aa)|utl[øo]p|giltig|gyldig|ablauf|vencimiento|caducidad|expiration|scadenza|validade|有効期限|유효.?기간|有效期/i
const MONTH = /month|m[åa]ned|m[åa]nad|monat|\bmes\b|mois|mese|\bmm\b|exp.?m/i
const YEAR = /year|\b[åa]r\b|jahr|a[ñn]o|ann[ée]e|anno|\byy(yy)?\b|exp.?y/i
const CVC =
  /cvc|cvv|csc|\bcid\b|security.?code|sikkerhetskode|s[äa]kerhetskod|kontrollsiffer|pr[üu]fnummer|c[óo]digo.?de.?seguridad|cryptogramme|codice.?di.?sicurezza|c[óo]digo.?de.?seguran[çc]a|セキュリティ|보안.?코드|安全码/i
const HOLDER =
  /card.?holder|name.?on.?card|cc.?name|kortholder|kortinnehavare|karteninhaber|titular|titulaire|intestatario|名義|소유자|持卡人/i

function hint(el: Element): string {
  const labels =
    el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.labels : null
  const label = labels ? Array.from(labels, (l) => l.textContent).join(' ') : ''
  return [
    el.getAttribute('name'),
    el.id,
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    label,
  ]
    .filter(Boolean)
    .join(' ')
}

function auto(el: Element): string {
  return (el.getAttribute('autocomplete') ?? '').toLowerCase()
}

function usable(el: Field, isVisible: Visible): boolean {
  return !el.disabled && !(el instanceof HTMLInputElement && el.readOnly) && isVisible(el)
}

function textLike(el: HTMLInputElement): boolean {
  return ['text', 'tel', 'number', ''].includes(el.type)
}

/** True for a card number field. */
export function isCardNumberField(el: HTMLInputElement): boolean {
  if (auto(el).includes('cc-number')) return true
  return textLike(el) && NUMBER.test(hint(el)) && !CVC.test(hint(el))
}

/** The card fields of the form that holds `near` (or of the page), or `null` without a number field. */
export function findCard(
  root: Document,
  isVisible: Visible = layoutVisible,
  near: HTMLInputElement | null = null,
): CardFields | null {
  const scopeOf = (el: HTMLInputElement): ParentNode => el.form ?? root
  const numbers = Array.from(root.querySelectorAll('input')).filter(
    (el) => isCardNumberField(el) && usable(el, isVisible),
  )
  const number = (near && numbers.includes(near) ? near : null) ?? numbers[0]
  if (!number) return null
  const fields = Array.from(scopeOf(number).querySelectorAll<Field>('input, select')).filter(
    (el) => el !== number && usable(el, isVisible),
  )
  const input = (el: Field): el is HTMLInputElement => el instanceof HTMLInputElement
  const by = (ac: string, re: RegExp, extra: (el: Field) => boolean = () => true) =>
    fields.find((el) => auto(el) === ac) ??
    fields.find((el) => !auto(el).startsWith('cc-') && re.test(hint(el)) && extra(el)) ??
    null
  const cvc = by(
    'cc-csc',
    CVC,
    (el) => (input(el) && textLike(el)) || (input(el) && el.type === 'password'),
  )
  const month = by('cc-exp-month', MONTH, (el) => el !== cvc)
  const year = by('cc-exp-year', YEAR, (el) => el !== cvc && el !== month)
  const expiry =
    month && year
      ? null
      : by('cc-exp', EXPIRY, (el) => input(el) && el !== cvc && el !== month && el !== year)
  const holder = by('cc-name', HOLDER, (el) => input(el) && el.type !== 'password')
  return {
    number,
    expiry: expiry && input(expiry) ? expiry : null,
    month: expiry ? null : month,
    year: expiry ? null : year,
    cvc: cvc && input(cvc) ? cvc : null,
    holder: holder && input(holder) ? holder : null,
  }
}

const two = (n: number) => String(n).padStart(2, '0')

/** The expiry as one field wants it: "MM/YYYY" when it has room for four year digits, else "MM/YY". */
export function expiryText(el: HTMLInputElement, month: number, year: number): string {
  const wantsLong =
    /yyyy|åååå|jjjj|aaaa/i.test(el.placeholder) || (el.maxLength >= 7 && el.maxLength <= 9)
  const spaced = /\s\/\s/.test(el.placeholder)
  const yy = wantsLong ? String(year) : two(year % 100)
  return spaced ? `${two(month)} / ${yy}` : `${two(month)}/${yy}`
}

function setSelect(el: HTMLSelectElement, wanted: string[]): boolean {
  const option = Array.from(el.options).find((o) =>
    wanted.some((w) => o.value.trim() === w || o.text.trim() === w),
  )
  if (!option) return false
  el.value = option.value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

function setPart(el: Field, n: number, kind: 'month' | 'year'): void {
  if (el instanceof HTMLSelectElement) {
    const options = kind === 'month' ? [two(n), String(n)] : [String(n), two(n % 100)]
    setSelect(el, options)
    return
  }
  const short = el.maxLength === 2 || /^(yy|åå|jj|aa)$/i.test(el.placeholder.trim())
  setValue(el, kind === 'month' ? two(n) : short ? two(n % 100) : String(n))
}

/** Fills `card` into `f` the way typing would. */
export function fillCard(f: CardFields, card: Card): void {
  setValue(f.number, card.number)
  if (f.expiry) setValue(f.expiry, expiryText(f.expiry, card.exp_month, card.exp_year))
  if (f.month) setPart(f.month, card.exp_month, 'month')
  if (f.year) setPart(f.year, card.exp_year, 'year')
  if (f.cvc && card.cvc) setValue(f.cvc, card.cvc)
  if (f.holder && card.holder && f.holder.value.trim() === '') setValue(f.holder, card.holder)
}

/** Empties the number, expiry and CVC again (the holder stays). */
export function clearCard(f: CardFields): void {
  for (const el of [f.number, f.expiry, f.cvc]) if (el) setValue(el, '')
  for (const el of [f.month, f.year]) {
    if (el instanceof HTMLSelectElement) {
      el.selectedIndex = 0
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } else if (el) {
      setValue(el, '')
    }
  }
}

function partValue(el: Field | null): number | null {
  if (!el) return null
  const v = el instanceof HTMLSelectElement ? el.value : el.value
  const n = Number(v.replace(/\D/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A card the person typed and submitted: number, expiry and the rest, or `null`. */
export function typedCard(f: CardFields): Card | null {
  const number = f.number.value.replace(/[\s-]/g, '')
  if (!/^\d{12,19}$/.test(number)) return null
  let month = partValue(f.month)
  let year = partValue(f.year)
  if (f.expiry) {
    const m = /^\s*(\d{1,2})\s*[/.-]?\s*(\d{2}|\d{4})\s*$/.exec(f.expiry.value)
    month = m?.[1] ? Number(m[1]) : null
    year = m?.[2] ? Number(m[2]) : null
  }
  if (!month || !year || month > 12) return null
  if (year < 100) year += 2000
  const card: Card = { number, exp_month: month, exp_year: year }
  const cvc = f.cvc?.value.trim()
  if (cvc && /^\d{3,4}$/.test(cvc)) card.cvc = cvc
  const holder = f.holder?.value.trim()
  if (holder) card.holder = holder.slice(0, 100)
  return card
}
