import { describe, expect, it } from 'vitest'
import { labelOf, newPasswordForm, rulesOf } from './newpassword'

const visible = () => true

function page(html: string, title = 'Test site'): Document {
  document.title = title
  document.body.innerHTML = html
  return document
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement
const ids = (f: ReturnType<typeof newPasswordForm>) =>
  f && {
    password: f.password.id,
    confirm: f.confirm?.id ?? null,
    current: f.current?.id ?? null,
    username: f.username?.id ?? null,
    change: f.change,
  }

describe('newPasswordForm: sign-up pages', () => {
  it('finds the Google style "Create a strong password" step by its texts', () => {
    page(`<div><h1>Create a strong password</h1>
      <p>Create a strong password with a mix of letters, numbers and symbols</p>
      <form><div class="f"><div class="w"><input type="password" name="Passwd" id="p" aria-label="Password"></div>
        <div aria-hidden="true">Password</div></div>
      <div class="f"><div class="w"><input type="password" name="PasswdAgain" id="c" aria-label="Confirm"></div>
        <div aria-hidden="true">Confirm</div></div>
      <label><input type="checkbox"> Show password</label>
      <button type="button">Next</button></form></div>`)
    expect(ids(newPasswordForm(field('p'), document, visible))).toEqual({
      password: 'p',
      confirm: 'c',
      current: null,
      username: null,
      change: false,
    })
    // The confirm field belongs to the same form.
    expect(newPasswordForm(field('c'), document, visible)?.password.id).toBe('p')
  })

  it('finds a generic sign-up with the e-mail address and one new password', () => {
    page(`<form><h2>Join us</h2>
      <label for="n">Name</label><input id="n" name="name">
      <label for="e">E-mail</label><input id="e" type="email" name="email">
      <label for="p">Password</label><input id="p" type="password" autocomplete="new-password">
      <button>Create account</button></form>`)
    const form = newPasswordForm(field('p'), document, visible)
    expect(ids(form)).toEqual({
      password: 'p',
      confirm: null,
      current: null,
      username: 'e',
      change: false,
    })
    // The e-mail field of the same form gets the same form.
    expect(newPasswordForm(field('e'), document, visible)?.password.id).toBe('p')
  })

  it('finds a sign-up with one password field by its heading', () => {
    page(`<h1>Create your account</h1><form>
      <input id="u" name="username"><input id="p" type="password" name="pw">
      <button>Continue</button></form>`)
    expect(ids(newPasswordForm(field('p'), document, visible))?.username).toBe('u')
  })

  it('finds a password and its repeat field by their names only', () => {
    page(`<form><input id="e" name="email"><input id="p" type="password" name="password1">
      <input id="c" type="password" name="password2"></form>`)
    expect(ids(newPasswordForm(field('c'), document, visible))).toMatchObject({
      password: 'p',
      confirm: 'c',
    })
  })

  it('reads the texts of the other languages', () => {
    page(`<form><label>E-post <input id="e" type="email"></label>
      <label>Lag et passord <input id="p" type="password"></label>
      <label>Gjenta passordet <input id="c" type="password"></label></form>`)
    expect(ids(newPasswordForm(field('p'), document, visible))?.confirm).toBe('c')
    page(`<form><label>新しいパスワード <input id="p" type="password"></label></form>`)
    expect(newPasswordForm(field('p'), document, visible)?.password.id).toBe('p')
    page(`<form><label>Créez un mot de passe <input id="p" type="password"></label></form>`)
    expect(newPasswordForm(field('p'), document, visible)?.password.id).toBe('p')
    page(`<form><label>새 비밀번호 <input id="p" type="password"></label></form>`)
    expect(newPasswordForm(field('p'), document, visible)?.password.id).toBe('p')
  })

  it('takes the hidden user name that a site keeps for password managers', () => {
    page(`<form><input type="hidden" autocomplete="username" id="h" value="alex.new@example.com">
      <h1>Choose a password</h1><input id="p" type="password"></form>`)
    const form = newPasswordForm(field('p'), document, visible)
    expect(form?.username?.value).toBe('alex.new@example.com')
  })
})

describe('newPasswordForm: password changes', () => {
  it('finds current, new and confirm by their labels', () => {
    page(`<form>
      <label for="o">Current password</label><input id="o" type="password">
      <label for="p">New password</label><input id="p" type="password">
      <label for="c">Confirm new password</label><input id="c" type="password">
      <button>Change password</button></form>`)
    expect(ids(newPasswordForm(field('p'), document, visible))).toEqual({
      password: 'p',
      confirm: 'c',
      current: 'o',
      username: null,
      change: true,
    })
  })

  it('finds a change form by autocomplete only, with the fields in any order', () => {
    page(`<form><input id="u" autocomplete="username" value="alex">
      <input id="p" type="password" autocomplete="new-password">
      <input id="c" type="password" autocomplete="new-password">
      <input id="o" type="password" autocomplete="current-password"></form>`)
    expect(ids(newPasswordForm(field('o'), document, visible))).toMatchObject({
      password: 'p',
      confirm: 'c',
      current: 'o',
      username: 'u',
      change: true,
    })
  })

  it('finds a change form with the current and the new password only', () => {
    page(`<form><label>Old password <input id="o" type="password"></label>
      <label>Nytt passord <input id="p" type="password"></label></form>`)
    expect(ids(newPasswordForm(field('p'), document, visible))).toMatchObject({
      password: 'p',
      confirm: null,
      current: 'o',
      change: true,
    })
  })
})

describe('newPasswordForm: sign-in pages do not count', () => {
  it('a plain sign-in', () => {
    page(`<h1>Sign in</h1><form>
      <input id="e" type="email" autocomplete="username">
      <input id="p" type="password" autocomplete="current-password">
      <a href="/reset">Forgot password? Create a new password</a>
      <button>Sign in</button></form>
      <p>New here? <a href="/signup">Create an account</a></p>`)
    expect(newPasswordForm(field('p'), document, visible)).toBeNull()
    expect(newPasswordForm(field('e'), document, visible)).toBeNull()
  })

  it('a sign-in without autocomplete and with a link to a new password', () => {
    page(`<div><h1>Log in</h1><form><label>E-mail <input id="e" name="email"></label>
      <div><label for="p">Password</label><input id="p" type="password" name="password">
      <a href="/forgot">Choose a new password</a></div></form></div>`)
    expect(newPasswordForm(field('p'), document, visible)).toBeNull()
  })

  it('a page with both a sign-in and a sign-up form', () => {
    page(`<h1>Sign in or create an account</h1>
      <form id="in"><h2>Sign in</h2><input id="e1" type="email"><input id="p1" type="password"></form>
      <form id="up"><h2>Create an account</h2><input id="e2" type="email">
        <input id="p2" type="password"><input id="c2" type="password"></form>`)
    expect(newPasswordForm(field('p1'), document, visible)).toBeNull()
    expect(ids(newPasswordForm(field('p2'), document, visible))).toMatchObject({
      password: 'p2',
      confirm: 'c2',
      username: 'e2',
    })
  })

  it('a sign-in with a password and a PIN', () => {
    page(`<h1>Online bank</h1><form><input id="u" name="user">
      <label>Password <input id="p" type="password"></label>
      <label>PIN <input id="pin" type="password"></label></form>`)
    expect(newPasswordForm(field('p'), document, visible)).toBeNull()
  })

  it('a page that asks for the password again to confirm access', () => {
    page(`<h1>Confirm access</h1><form><label>Password <input id="p" type="password"></label>
      <button>Confirm</button></form>`)
    expect(newPasswordForm(field('p'), document, visible)).toBeNull()
  })

  it('a hidden password field', () => {
    page(`<form><input id="p" type="password" autocomplete="new-password"></form>`)
    expect(newPasswordForm(field('p'), document, () => false)).toBeNull()
  })
})

describe('rulesOf', () => {
  it('reads passwordrules, minlength, maxlength and pattern', () => {
    page(`<form><input id="p" type="password" autocomplete="new-password" minlength="12" maxlength="64"
      passwordrules="minlength: 12; required: lower; required: upper; required: digit; allowed: [-_!]">
      <input id="c" type="password" pattern="[A-Za-z0-9_!-]{12,64}"></form>`)
    const form = newPasswordForm(field('p'), document, visible)
    if (!form) throw new Error('no form')
    expect(rulesOf(form)).toEqual({
      passwordrules:
        'minlength: 12; required: lower; required: upper; required: digit; allowed: [-_!]',
      min_length: 12,
      max_length: 64,
      pattern: '[A-Za-z0-9_!-]{12,64}',
    })
  })

  it('gives no rules for a field without any', () => {
    page(`<form><input id="p" type="password" autocomplete="new-password"></form>`)
    const form = newPasswordForm(field('p'), document, visible)
    if (!form) throw new Error('no form')
    expect(rulesOf(form)).toEqual({})
  })
})

describe('labelOf', () => {
  it('reads labels, aria-labelledby and the text around the field, but not links', () => {
    page(`<span id="l">Repeat it</span><div><span>Password</span>
      <input id="p" type="password" aria-labelledby="l"><a href="/x">Forgot?</a></div>`)
    const text = labelOf(field('p'))
    expect(text).toContain('Repeat it')
    expect(text).toContain('Password')
    expect(text).not.toContain('Forgot')
  })
})
