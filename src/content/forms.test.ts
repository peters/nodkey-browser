import { beforeEach, describe, expect, it } from 'vitest'
import { findLogin, findOtp, isOtpField, submission } from './forms'

const visible = () => true

function page(html: string): Document {
  document.body.innerHTML = html
  return document
}

describe('findLogin', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('finds the user name and password of a sign-in form', () => {
    const doc = page(`<form>
      <input name="q" placeholder="Search">
      <input type="email" name="email" id="u">
      <input type="password" id="p">
      <button>Sign in</button></form>`)
    const login = findLogin(doc, visible)
    expect(login?.username?.id).toBe('u')
    expect(login?.password?.id).toBe('p')
  })

  it('prefers autocomplete hints and skips disabled fields', () => {
    const doc = page(`<form>
      <input name="other">
      <input autocomplete="username" id="u">
      <input type="text" name="otp" maxlength="6" autocomplete="one-time-code">
      <input type="password" disabled>
      <input type="password" autocomplete="current-password" id="p"></form>`)
    const login = findLogin(doc, visible)
    expect(login?.username?.id).toBe('u')
    expect(login?.password?.id).toBe('p')
  })

  it('handles a user name step without a password field', () => {
    const doc = page(`<form><input type="email" id="u"><button>Next</button></form>`)
    expect(findLogin(doc, visible)).toEqual({ username: doc.getElementById('u'), password: null })
  })

  it('finds nothing on a page without sign-in fields', () => {
    expect(findLogin(page(`<input name="q">`), visible)).toBeNull()
  })

  it('ignores fields that are not visible', () => {
    const doc = page(`<input type="password" id="hidden"><input type="password" id="shown">`)
    const login = findLogin(doc, (el) => el.id === 'shown')
    expect(login?.password?.id).toBe('shown')
  })
})

describe('findOtp', () => {
  it('finds a one-time code field', () => {
    const doc = page(
      `<input name="search"><input id="c" name="totp" inputmode="numeric" maxlength="6">`,
    )
    expect(findOtp(doc, visible).map((e) => e.id)).toEqual(['c'])
    expect(isOtpField(doc.getElementById('c') as HTMLInputElement)).toBe(true)
  })

  it('finds a row of one-digit boxes', () => {
    const boxes = Array.from({ length: 6 }, (_, i) => `<input id="d${i}" maxlength="1">`).join('')
    const doc = page(`<div>${boxes}</div>`)
    expect(findOtp(doc, visible)).toHaveLength(6)
  })

  it('does not take a postal code for a one-time code', () => {
    const doc = page(`<input name="zip" maxlength="5" placeholder="Postal code">`)
    expect(findOtp(doc, visible)).toEqual([])
  })
})

describe('submission', () => {
  it('reads the user name and password of a sign-in', () => {
    const doc = page(
      `<form><input type="email" value="alex@example.com"><input type="password" value="pw1"></form>`,
    )
    expect(submission(doc, visible)).toEqual({ username: 'alex@example.com', password: 'pw1' })
  })

  it('keeps the new password of a change-password form', () => {
    const doc = page(`<form>
      <input name="username" value="alex">
      <input type="password" value="old" autocomplete="current-password">
      <input type="password" value="new" autocomplete="new-password">
      <input type="password" value="new" autocomplete="new-password"></form>`)
    expect(submission(doc, visible)).toEqual({ username: 'alex', password: 'new' })
  })

  it('keeps the repeated password of a sign-up form', () => {
    const doc = page(`<form><input name="email" value="a@example.com">
      <input type="password" value="s3cret"><input type="password" value="s3cret"></form>`)
    expect(submission(doc, visible)?.password).toBe('s3cret')
  })

  it('reads a user name step', () => {
    const doc = page(`<form><input name="login" value=" alex "></form>`)
    expect(submission(doc, visible)).toEqual({ username: 'alex', password: '' })
  })

  it('returns nothing without typed values', () => {
    expect(submission(page(`<form><input type="password"></form>`), visible)).toBeNull()
  })
})
