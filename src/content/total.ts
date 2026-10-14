/**
 * Finds the order total on a checkout page and reads it as shops print it ("1 234,50 kr",
 * "€1.234,50", "$1,234.50", "499,-"). Pure DOM and text logic, tested with jsdom. The limits are
 * in docs/adr/0009-card-fill.md.
 */

import type { Money } from '../utils/money'
import type { Visible } from './forms'
import { layoutVisible } from './forms'

const CODES = [
  'NOK',
  'SEK',
  'DKK',
  'ISK',
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'PLN',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'KRW',
  'CNY',
  'BRL',
]

/** Currency signs, longest first so "US$" wins over "$". */
const SIGNS: [string, string][] = [
  ['US$', 'USD'],
  ['R$', 'BRL'],
  ['zł', 'PLN'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['$', 'USD'],
  ['¥', 'JPY'],
  ['₩', 'KRW'],
]

/** Which "kr" a page means, from its language or its address; `null` when it cannot tell. */
export function krCurrency(lang: string, host: string): string | null {
  const l = lang.toLowerCase().split(/[-_]/)
  const byLang: Record<string, string> = {
    nb: 'NOK',
    nn: 'NOK',
    no: 'NOK',
    sv: 'SEK',
    da: 'DKK',
    is: 'ISK',
  }
  const fromLang = byLang[l[0] ?? '']
  if (fromLang) return fromLang
  const tld = host.toLowerCase().split('.').at(-1) ?? ''
  const byTld: Record<string, string> = { no: 'NOK', se: 'SEK', dk: 'DKK', is: 'ISK' }
  return byTld[tld] ?? null
}

/** The digits of an amount in `text` as a protocol value ("1234.50"), or `null`. */
export function readNumber(text: string): string | null {
  const m = /\d[\d \u00a0\u202f.,']*(?:[.,]-{1,2})?/.exec(text)
  if (!m) return null
  let s = m[0].replace(/[.,]-{1,2}$/, '').replace(/[ \u00a0\u202f']/g, '')
  s = s.replace(/[.,]+$/, '')
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  if (dots > 0 && commas > 0) {
    // The last separator is the decimal one.
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const other = decimal === '.' ? ',' : '.'
    s = s.split(other).join('').replace(decimal, '.')
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ','
    const after = s.length - s.indexOf(sep) - 1
    // Three digits after a single separator are a thousands group ("1.234", "1,234").
    s = after === 3 ? s.replace(sep, '') : s.replace(sep, '.')
  } else if (dots + commas > 1) {
    s = s.replace(/[.,]/g, '')
  }
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null
  return s.replace(/^0+(?=\d)/, '')
}

/** The currency named in `text`, or `null`. `kr` is the currency "kr" means on this page. */
export function readCurrency(text: string, kr: string | null): string | null {
  const upper = text.toUpperCase()
  const code = CODES.find((c) => new RegExp(`(^|[^A-Z])${c}([^A-Z]|$)`).test(upper))
  if (code) return code
  const sign = SIGNS.find(([s]) => text.includes(s))
  if (sign) return sign[1]
  if (/(^|[^a-zæøå])kr\.?([^a-zæøå]|$)/i.test(text)) return kr
  return null
}

/** An amount with its currency in `text`; `null` when either is missing. */
export function readAmount(text: string, kr: string | null): Money | null {
  const value = readNumber(text)
  const currency = readCurrency(text, kr)
  return value && currency ? { value, currency } : null
}

/** Labels of the order total in the twelve languages, and lines that are not the total. */
const TOTAL =
  /total|totalt|totalsum|sum|summa|i alt|å betale|att betala|at betale|to pay|amount due|gesamt|zu zahlen|importe|montant|totale|合計|お支払い|총액|결제 금액|总计|合计|应付/i
const NOT_TOTAL =
  /sub.?total|delsum|delsumma|subtotal|zwischensumme|sous-total|subtotale|小計|소계|小计|tax|mva|moms|vat|mwst|iva|tva|shipping|frakt|fragt|versand|envío|livraison|spedizione|frete|送料|배송|运费|discount|rabatt|savings|sparer/i

export interface PageTotal {
  amount: Money
  /** The element that shows it, to point at it. */
  element: HTMLElement
  /** The text it was read from, as shown on the page. */
  text: string
}

function ownText(el: Element): string {
  return el.textContent.replace(/\s+/g, ' ').trim()
}

/** Elements that name the total by their id, class or data attributes, or by their label text. */
function candidates(root: Document, isVisible: Visible): HTMLElement[] {
  const all = Array.from(root.body.querySelectorAll<HTMLElement>('*')).filter(
    (el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'NODKEY-UI'].includes(el.tagName),
  )
  const out: HTMLElement[] = []
  for (const el of all) {
    const named = [el.id, el.getAttribute('class') ?? '', el.getAttribute('data-testid') ?? '']
      .join(' ')
      .toLowerCase()
    const text = ownText(el)
    if (text.length === 0 || text.length > 120 || !isVisible(el)) continue
    if (NOT_TOTAL.test(named) || NOT_TOTAL.test(text)) continue
    if (/total|sum/.test(named) || (TOTAL.test(text) && el.children.length <= 4)) out.push(el)
  }
  return out
}

/**
 * The order total of a checkout page: the largest amount on a line that names the total (so a
 * mistake shows the person more, never less). `null` when the page shows none with a currency.
 */
export function findTotal(root: Document, isVisible: Visible = layoutVisible): PageTotal | null {
  const kr = krCurrency(root.documentElement.lang, root.location.hostname)
  let best: PageTotal | null = null
  let bestValue = -1
  for (const el of candidates(root, isVisible)) {
    // The amount is in the line itself, or, for a label without a number, in its small row.
    const text = ownText(el)
    const parent = el.parentElement
    const row =
      readNumber(text) === null && parent && parent !== root.body && parent.children.length <= 4
        ? ownText(parent)
        : ''
    const own = readAmount(text, kr)
    const amount = own ?? (row.length <= 160 ? readAmount(row, kr) : null)
    if (!amount) continue
    const n = Number(amount.value)
    if (n > bestValue) {
      bestValue = n
      best = { amount, element: el, text: (own ? text : row).slice(0, 80) }
    }
  }
  return best
}
