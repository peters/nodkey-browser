import { describe, expect, it } from 'vitest'
import {
  clickedProvider,
  offeredSteps,
  phonePrompt,
  providerButtons,
  providerOf,
  smsPage,
  stepOf,
} from './signin'

const all = () => true

function doc(html: string): Document {
  document.body.innerHTML = html
  return document
}

describe('provider buttons', () => {
  it('finds "Sign in with" buttons and links in several languages', () => {
    const d = doc(`
      <button id="g">Sign in with Google</button>
      <a id="a" href="/auth/apple">Continue with Apple</a>
      <button id="gh"><img alt="GitHub"> Logg inn med GitHub</button>
      <a id="ms" href="https://login.microsoftonline.com/common/oauth2/authorize">Microsoft</a>
      <button id="fb" aria-label="Continuer avec Facebook"><svg></svg></button>
      <button id="plain">Sign in</button>
      <a id="news" href="/news">Google buys a company</a>`)
    expect(providerButtons(d, all).map((b) => [b.provider, b.element.id])).toEqual([
      ['google', 'g'],
      ['apple', 'a'],
      ['github', 'gh'],
      ['microsoft', 'ms'],
      ['facebook', 'fb'],
    ])
    expect(providerOf(d.getElementById('news') as Element)).toBeNull()
  })

  it('names the provider of a click inside the button', () => {
    const d = doc('<button><span id="inner">Continue with Google</span></button><p id="p">x</p>')
    expect(clickedProvider(d.getElementById('inner'))).toBe('google')
    expect(clickedProvider(d.getElementById('p'))).toBeNull()
    expect(clickedProvider(null)).toBeNull()
  })
})

describe('second steps', () => {
  it('finds the "Try another way" link of a phone prompt', () => {
    const d = doc(`<h1>Check your phone</h1><p>Google sent a notification. Tap Yes.</p>
      <ul><li><a id="other" href="#">Try another way</a></li></ul>`)
    expect(phonePrompt(d, all)?.id).toBe('other')
    expect(
      phonePrompt(doc('<h1>Sjekk telefonen</h1><button id="b">Prøv en annen måte</button>'), all)
        ?.id,
    ).toBe('b')
    // A page without a prompt, or a prompt without a way out.
    expect(phonePrompt(doc('<a>Try another way</a>'), all)).toBeNull()
    expect(phonePrompt(doc('<h1>Check your phone</h1>'), all)).toBeNull()
  })

  it('names the ways to sign in in a list of choices', () => {
    const d = doc(`<a id="back">Try another way</a><ul>
      <li id="prompt">Tap Yes on your phone or tablet</li>
      <li id="passkey"><div>Use your passkey</div></li>
      <li id="totp">Get a verification code from the Google Authenticator app</li>
      <li id="sms">Get a verification code at (•••) •••-••12</li>
      <li id="mail">Get a code by e-mail</li>
      <li id="help">Get help</li></ul>`)
    const found = offeredSteps(d, d.getElementById('back'), all)
    expect(Object.fromEntries([...found].map(([step, el]) => [step, el.id]))).toEqual({
      app_prompt: 'prompt',
      passkey: 'passkey',
      totp: 'totp',
      sms: 'sms',
      email: 'mail',
    })
    expect(stepOf(d.getElementById('help') as Element)).toBeNull()
  })

  it('knows a page that asks for a code sent by SMS', () => {
    expect(smsPage(doc('<p>We sent a code by text message to •• 12.</p>'))).toBe(true)
    expect(smsPage(doc('<p>Vi har sendt en kode på tekstmelding.</p>'))).toBe(true)
    expect(smsPage(doc('<p>Enter the code from your authenticator app.</p>'))).toBe(false)
  })
})
