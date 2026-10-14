/**
 * Amounts of money as the protocol carries them: `{value, currency}` with a decimal string that
 * uses a dot (`"499.00"`) and an ISO 4217 code. The WebAssembly module checks them by the
 * protocol's rules; this file only compares and shows them, and runs in the content script too.
 */

export interface Money {
  value: string
  currency: string
}

/** The amount in thousandths of the currency unit, or `null` when `value` is not a plain decimal. */
export function thousandths(value: string): number | null {
  const m = /^(\d{1,12})(?:\.(\d{1,3}))?$/.exec(value)
  if (!m?.[1]) return null
  return Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'))
}

/** True when `a` is more than `b`. Another currency, or an amount that cannot be read, counts as more. */
export function exceeds(a: Money, b: Money): boolean {
  if (a.currency !== b.currency) return true
  const x = thousandths(a.value)
  const y = thousandths(b.value)
  return x === null || y === null || x > y
}

/** The amount as the person reads it in their language, e.g. "499,00 kr". */
export function formatMoney(m: Money, language: string): string {
  const n = Number(m.value)
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency: m.currency }).format(n)
  } catch {
    return `${m.value} ${m.currency}`
  }
}
