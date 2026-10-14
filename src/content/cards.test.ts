import { beforeEach, describe, expect, it } from 'vitest'
import { clearCard, expiryText, fillCard, findCard, isCardNumberField, typedCard } from './cards'

const visible = () => true
const CARD = {
  number: '4242424242424242',
  exp_month: 3,
  exp_year: 2030,
  cvc: '123',
  holder: 'Alex Example',
}

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement
}

describe('card fields', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('finds the fields by autocomplete and fills them', () => {
    document.body.innerHTML = `<form>
      <input id="n" autocomplete="cc-number"><input id="e" autocomplete="cc-exp" placeholder="MM/YY">
      <input id="c" autocomplete="cc-csc"><input id="h" autocomplete="cc-name"></form>`
    const f = findCard(document, visible)
    expect(f?.number.id).toBe('n')
    expect(f?.expiry?.id).toBe('e')
    expect(f?.cvc?.id).toBe('c')
    if (!f) return
    fillCard(f, CARD)
    expect(input('n').value).toBe('4242424242424242')
    expect(input('e').value).toBe('03/30')
    expect(input('c').value).toBe('123')
    expect(input('h').value).toBe('Alex Example')
    expect(typedCard(f)).toEqual(CARD)
    clearCard(f)
    expect([input('n').value, input('e').value, input('c').value]).toEqual(['', '', ''])
    expect(input('h').value).toBe('Alex Example')
  })

  it('finds fields by name and label, with month and year selects', () => {
    document.body.innerHTML = `<form>
      <label for="k">Kortnummer</label><input id="k" name="kort">
      <select id="m" name="expMonth"><option value="">MM</option><option value="03">03</option></select>
      <select id="y" name="expYear"><option value="">ÅÅ</option><option value="2030">2030</option></select>
      <input id="s" name="cvv" maxlength="4"></form>`
    expect(isCardNumberField(input('k'))).toBe(true)
    const f = findCard(document, visible)
    expect([f?.month?.id, f?.year?.id, f?.cvc?.id]).toEqual(['m', 'y', 's'])
    if (!f) return
    fillCard(f, CARD)
    expect((document.getElementById('m') as HTMLSelectElement).value).toBe('03')
    expect((document.getElementById('y') as HTMLSelectElement).value).toBe('2030')
  })

  it('writes the expiry the way the field wants it', () => {
    document.body.innerHTML = `<input id="a" placeholder="MM / YYYY"><input id="b" maxlength="5">`
    expect(expiryText(input('a'), 3, 2030)).toBe('03 / 2030')
    expect(expiryText(input('b'), 11, 2031)).toBe('11/31')
  })

  it('reads no card from a number that is too short or an unclear expiry', () => {
    document.body.innerHTML = `<form><input id="n" autocomplete="cc-number" value="4242">
      <input id="e" autocomplete="cc-exp" value="13/30"></form>`
    const f = findCard(document, visible)
    expect(f && typedCard(f)).toBeNull()
    input('n').value = '4242 4242 4242 4242'
    expect(f && typedCard(f)).toBeNull()
    input('e').value = '12/2030'
    expect(f && typedCard(f)).toEqual({ number: '4242424242424242', exp_month: 12, exp_year: 2030 })
  })

  it('does not take a search or code field for a card number', () => {
    document.body.innerHTML = `<input id="q" name="search"><input id="c" name="cvc">`
    expect(findCard(document, visible)).toBeNull()
  })
})
