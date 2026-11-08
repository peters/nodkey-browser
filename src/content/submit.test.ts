import { beforeEach, describe, expect, it } from 'vitest'
import { isSubmitClick, isSubmitEnter } from './submit'

function el(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`no #${id} in the test page`)
  return found
}

function input(id: string): HTMLInputElement {
  return el(id) as HTMLInputElement
}

describe('a click that submits', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('takes the submit buttons of a form', () => {
    document.body.innerHTML = `<form>
      <input id="field" name="user">
      <input id="send" type="submit">
      <input id="picture" type="image" alt="Log in">
      <button id="next" type="submit">Log in</button>
      <button id="plain">Log in</button>
    </form>`
    expect(isSubmitClick(el('send'))).toBe(true)
    expect(isSubmitClick(el('picture'))).toBe(true)
    expect(isSubmitClick(el('next'))).toBe(true)
    // A button without a `type` submits its form.
    expect(isSubmitClick(el('plain'))).toBe(true)
    // A click on the text inside a button is a click on its button.
    el('next').innerHTML = '<span id="inner">Log in</span>'
    expect(isSubmitClick(el('inner'))).toBe(true)
  })

  it('takes a formless button that says that it submits', () => {
    document.body.innerHTML = `<button id="login">Logg inn</button>
      <button id="button" type="button">Logg inn</button>
      <button id="pay" type="button" aria-label="Betal nå">Betal</button>
      <input id="send" type="button" value="Sign in">`
    expect(isSubmitClick(el('login'))).toBe(true)
    expect(isSubmitClick(el('button'))).toBe(true)
    // The label wins over the text.
    expect(isSubmitClick(el('pay'))).toBe(true)
    expect(isSubmitClick(el('send'))).toBe(true)
  })

  it('leaves out the buttons that are not a submit', () => {
    document.body.innerHTML = `<form>
      <button id="country" type="button">Velg land</button>
      <button id="eye" type="button">Show password</button>
      <button id="eye-no" type="button">Vis passord</button>
      <button id="eye-de" type="button">Passwort anzeigen</button>
      <button id="reset" type="reset">Nullstill</button>
      <input id="text" name="q">
    </form>
    <button id="plain">Velg land</button>
    <div><button id="order" type="button">Bestill</button></div>`
    expect(isSubmitClick(el('country'))).toBe(false)
    // A formless button without a submit word in it submits nothing either.
    expect(isSubmitClick(el('plain'))).toBe(false)
    expect(isSubmitClick(el('eye'))).toBe(false)
    expect(isSubmitClick(el('eye-no'))).toBe(false)
    expect(isSubmitClick(el('eye-de'))).toBe(false)
    expect(isSubmitClick(el('reset'))).toBe(false)
    expect(isSubmitClick(el('text'))).toBe(false)
    // The body is not a button.
    expect(isSubmitClick(document.body)).toBe(false)
    expect(isSubmitClick(el('order'))).toBe(true)
  })

  it('leaves out a picker, a list, a tab and a switch', () => {
    document.body.innerHTML = `<form>
      <button id="select" role="combobox" aria-expanded="false" type="submit">Land</button>
      <div role="listbox">
        <div role="option"><button id="option" type="submit">Norge</button></div>
      </div>
      <button id="popup" aria-haspopup="listbox" type="submit">Land</button>
      <button id="menu" role="menuitem" type="submit">Norge</button>
      <button id="tab" role="tab" type="submit">Kort</button>
      <button id="switch" role="switch" aria-checked="true" type="submit">Lagre kortet</button>
      <button id="radio" role="radio" type="submit">Betal</button>
      <button id="toggle" aria-pressed="true" type="submit">Betal</button>
    </form>`
    for (const id of ['select', 'option', 'popup', 'menu', 'tab', 'switch', 'radio', 'toggle']) {
      expect(isSubmitClick(el(id)), id).toBe(false)
    }
  })

  it('stops at the form of the button, so a menu above the form does not count', () => {
    document.body.innerHTML = `<div role="menu">
      <form><button id="buy" type="submit">Kjøp</button></form>
    </div>`
    expect(isSubmitClick(el('buy'))).toBe(true)
  })
})

describe('Enter in a field', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('submits from a plain field', () => {
    document.body.innerHTML = `<form>
      <input id="user" name="user">
      <input id="password" type="password">
    </form>`
    expect(isSubmitEnter(input('user'))).toBe(true)
    expect(isSubmitEnter(input('password'))).toBe(true)
  })

  it('picks a value instead of submitting', () => {
    document.body.innerHTML = `<form>
      <input id="combo" role="combobox">
      <input id="autocomplete" aria-autocomplete="list">
      <input id="expanded" aria-expanded="true">
      <input id="popup" aria-haspopup="listbox">
      <input id="list" list="countries">
      <input id="search" type="search">
      <datalist id="countries"><option value="Norge"></option></datalist>
      <div role="combobox"><input id="inside-combo"></div>
      <div role="listbox"><input id="inside-list"></div>
      <input id="false-popup" aria-haspopup="false">
    </form>`
    for (const id of [
      'combo',
      'autocomplete',
      'expanded',
      'popup',
      'list',
      'search',
      'inside-combo',
      'inside-list',
    ]) {
      expect(isSubmitEnter(input(id)), id).toBe(false)
    }
    // "No list" is the same as no attribute.
    expect(isSubmitEnter(input('false-popup'))).toBe(true)
  })
})
