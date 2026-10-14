import { beforeEach, describe, expect, it } from 'vitest'
import { findTotal, krCurrency, readAmount, readNumber } from './total'

const visible = () => true

describe('reading amounts', () => {
  it('reads the number as shops print it', () => {
    const cases: [string, string | null][] = [
      ['1 234,50 kr', '1234.50'],
      ['1 234,50 kr', '1234.50'],
      ['€1.234,50', '1234.50'],
      ['$1,234.50', '1234.50'],
      ['499,-', '499'],
      ['499,00', '499.00'],
      ['1,234', '1234'],
      ["CHF 1'234.00", '1234.00'],
      ['Total: 0,5 €', '0.5'],
      ['no amount', null],
    ]
    for (const [text, want] of cases) expect(readNumber(text), text).toBe(want)
  })

  it('reads the currency, and kr by the page language or address', () => {
    expect(readAmount('Totalt 499,00 kr', 'NOK')).toEqual({ value: '499.00', currency: 'NOK' })
    expect(readAmount('499 SEK', null)).toEqual({ value: '499', currency: 'SEK' })
    expect(readAmount('US$ 20', null)).toEqual({ value: '20', currency: 'USD' })
    expect(readAmount('€20', null)?.currency).toBe('EUR')
    expect(readAmount('499 kr', null)).toBeNull()
    expect(readAmount('499', 'NOK')).toBeNull()
    expect(krCurrency('nb-NO', 'shop.example.com')).toBe('NOK')
    expect(krCurrency('', 'shop.example.se')).toBe('SEK')
    expect(krCurrency('en', 'shop.example.com')).toBeNull()
  })
})

describe('findTotal', () => {
  beforeEach(() => {
    document.documentElement.lang = 'nb'
    document.body.innerHTML = ''
  })

  it('finds the order total, not the sub-total, shipping or tax', () => {
    document.body.innerHTML = `<div class="summary">
      <div class="row"><span>Delsum</span><span>399,00 kr</span></div>
      <div class="row"><span>Frakt</span><span>100,00 kr</span></div>
      <div class="row"><span>MVA</span><span>99,80 kr</span></div>
      <div class="row"><span>Totalt</span><span id="t">499,00 kr</span></div></div>`
    const total = findTotal(document, visible)
    expect(total?.amount).toEqual({ value: '499.00', currency: 'NOK' })
    expect(total?.text).toContain('499,00')
  })

  it('takes an element named total, and the largest of two totals', () => {
    document.body.innerHTML = `<p id="order-total">4 999,00 kr</p><p>Total 499 kr</p>`
    expect(findTotal(document, visible)?.amount.value).toBe('4999.00')
  })

  it('finds nothing without a currency or a total', () => {
    document.body.innerHTML = `<p>Totalt 499</p><p>Pris 300 kr</p>`
    expect(findTotal(document, visible)).toBeNull()
  })
})
