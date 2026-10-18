/**
 * Sign-in methods in the page (ADR-0010): the question after a sign-in with a provider, the hint
 * on the provider's page, the method card with the provider's button, and the Nodkey button at
 * a phone prompt that chooses a passkey or a code from Nodkey instead.
 */

import type { MethodOffer, SigninPage, ToBackground, ToContent } from '../models/messages'
import type { SecondStep } from '../models/protocol'
import { t } from '../i18n/t'
import { mayFill } from '../utils/site'
import { findOtp, findLogin } from './forms'
import { clickedProvider, offeredSteps, phonePrompt, providerButtons } from './signin'
import type { PageUi } from './ui'

type Send = <T>(msg: ToBackground) => Promise<T | null>

const sleep = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

/** Waits up to `ms` for `check` to give a value. */
async function until<T>(check: () => T | null, ms: number): Promise<T | null> {
  const end = Date.now() + ms
  for (;;) {
    const v = check()
    if (v !== null || Date.now() > end) return v
    await sleep(250)
  }
}

/** A trusted click: tells the background when it was on "Sign in with <provider>". */
export function noteClick(e: MouseEvent, send: Send): void {
  if (!e.isTrusted || window !== window.top) return
  const provider = clickedProvider(e.target)
  if (provider) void send({ type: 'signin.clicked', provider })
}

function askRemember(offer: MethodOffer, ui: PageUi, send: Send): void {
  // Still on the sign-in page: the sign-in with the provider did not finish.
  if (providerButtons(document).some((b) => b.provider === offer.provider)) return
  if (findLogin(document)?.password) return
  ui.askSave(
    { site: offer.site, username: '' },
    (choice) => {
      if (choice === 'save') {
        void send({ type: 'signin.suggest', site: offer.site, provider: offer.provider })
      } else {
        void send({ type: 'signin.dismiss', site: offer.site, never: choice === 'never' })
      }
    },
    t('learnAsk', offer.site, offer.label),
    t('learnDetail'),
    t('learnRemember'),
  )
}

/** On a page load (top frame): the question after a provider sign-in, or the provider hint. */
export async function pageLoaded(ui: PageUi, send: Send): Promise<boolean> {
  const info = await send<SigninPage>({ type: 'signin.page' })
  // The code page after Nodkey chose a code at a second step.
  if (info?.fillCode && findOtp(document).length > 0) void send({ type: 'fill.code' })
  if (info?.via) {
    ui.showActivity({
      kind: 'login',
      state: 'approved',
      site: info.via.site,
      message: t('viaHint', info.via.label, info.via.username, info.via.site),
      at: Date.now(),
    })
    return true
  }
  if (info?.offer) {
    askRemember(info.offer, ui, send)
    return true
  }
  return false
}

/** The method card: how the person signs in, and a button that presses the provider's button. */
export function showMethod(msg: Extract<ToContent, { type: 'method' }>, ui: PageUi): void {
  const target = providerButtons(document).find((b) => b.provider === msg.provider)?.element
  if (!target || !msg.label) {
    ui.showMethod(msg.message)
    return
  }
  ui.showMethod(msg.message, {
    label: t('methodButton', msg.label),
    press: () => {
      target.scrollIntoView({ block: 'center' })
      target.click()
    },
  })
}

let watched: HTMLElement | null = null

/**
 * Looks for a phone prompt with a "Try another way" link and, when Nodkey has a passkey or a code
 * for the site, shows the Nodkey button next to the link.
 */
export async function watchPrompt(ui: () => PageUi, send: Send): Promise<void> {
  if (!mayFill(location.href)) return
  const link = phonePrompt(document)
  if (link === watched) return
  const had = watched
  watched = link
  if (!link) {
    if (had) ui().hideStepKey()
    return
  }
  if ((await send<boolean>({ type: 'step.available' })) !== true || watched !== link) return
  ui().showStepKey(link, t('stepButton'), () => {
    void chooseStep(link, ui(), send)
  })
}

/** Leaves the phone prompt for the way Nodkey prefers: a passkey, else a code from Nodkey. */
async function chooseStep(link: HTMLElement, ui: PageUi, send: Send): Promise<void> {
  ui.hideStepKey()
  ui.showMethod(t('stepWorking'))
  link.click()
  const choices = await until(() => {
    const found = offeredSteps(document, link)
    return found.size > 0 ? found : null
  }, 6000)
  const offered: SecondStep[] = choices ? [...choices.keys()] : []
  const pick = offered.length ? await send<SecondStep | null>({ type: 'step.pick', offered }) : null
  const choice = pick ? choices?.get(pick) : undefined
  if (!pick || !choice) {
    ui.showMethod(t('stepNone'))
    return
  }
  ui.closeCard()
  choice.click()
  // A passkey: the page asks for it, and Nodkey's passkey bridge answers. A code: fill it.
  if (pick === 'totp') {
    const field = await until(() => (findOtp(document).length > 0 ? true : null), 8000)
    if (field) void send({ type: 'fill.code' })
  }
}
