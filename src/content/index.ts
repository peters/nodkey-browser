/**
 * Runs in every page and frame: shows the Nodkey button in sign-in and code fields, fills what
 * the phone sent, and notices a submitted login so the person can save it in Nodkey.
 */

import type { CardOffer, Reply, SaveOffer, ToBackground, ToContent } from '../models/messages'
import { t } from '../i18n/t'
import { belongsTo, mayFill } from '../utils/site'
import { askCardSave, cardFill, cardSubmitted, isCardField, startPay } from './pay'
import { fillCode, setValue } from './fill'
import { findLogin, findOtp, isOtpField, submission } from './forms'
import { PageUi } from './ui'

let ui: PageUi | null = null

function page(): PageUi {
  ui ??= new PageUi((field) => {
    if (isCardField(field)) {
      startPay(field, page(), send)
      return
    }
    if (isOtpField(field) || boxRow(field)) {
      void send({ type: 'fill.code' })
      return
    }
    // A user name already in the form (typed, or filled by the browser) names the account.
    const username = findLogin(document)?.username?.value.trim()
    void send(username ? { type: 'fill.login', username } : { type: 'fill.login' })
  })
  return ui
}

async function send<T>(msg: ToBackground): Promise<T | null> {
  try {
    const reply = await chrome.runtime.sendMessage<ToBackground, Reply<T> | undefined>(msg)
    return reply?.ok ? reply.value : null
  } catch {
    // The extension was updated or reloaded; this page's script is stale.
    return null
  }
}

/** The row of code boxes `el` belongs to, if it is one of them. */
function boxRow(el: HTMLInputElement): HTMLInputElement[] | null {
  if (el.maxLength !== 1) return null
  const row = findOtp(document)
  return row.length > 1 && row.includes(el) ? row : null
}

function isLoginField(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false
  if (el.type === 'password' || isOtpField(el) || boxRow(el)) return true
  const login = findLogin(document, undefined, el)
  return login?.username === el
}

document.addEventListener(
  'focusin',
  (e) => {
    if (isCardField(e.target) && mayFill(location.href)) {
      page().showKey(e.target, e.target, t('cardButton'))
    } else if (isLoginField(e.target) && mayFill(location.href)) {
      page().showKey(e.target, boxRow(e.target)?.at(-1) ?? e.target)
    }
  },
  true,
)

document.addEventListener(
  'focusout',
  () => {
    // Later, so a click on the button still finds its field.
    window.setTimeout(() => {
      const active = document.activeElement
      if (!isLoginField(active) && !isCardField(active)) ui?.hideKey()
    }, 250)
  },
  true,
)

function fill(msg: Extract<ToContent, { type: 'fill' }>): boolean {
  // Only into the site the phone answered for, and never over plain HTTP on the internet.
  if (!belongsTo(location.href, msg.site) || !mayFill(location.href)) return false
  let filled = false
  if (msg.password !== undefined || msg.username !== undefined) {
    const login = findLogin(document)
    if (login?.username && msg.username !== undefined) {
      setValue(login.username, msg.username)
      filled = true
    }
    if (login?.password && msg.password !== undefined) {
      setValue(login.password, msg.password)
      filled = true
    }
  }
  if (msg.code !== undefined) {
    const otp = findOtp(document)
    if (otp.length > 0) filled = fillCode(otp, msg.code) || filled
  }
  return filled
}

chrome.runtime.onMessage.addListener((msg: ToContent, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  if (msg.type === 'fill') {
    if (!fill(msg)) return false // Let a frame that has the fields answer.
    sendResponse(true)
    return false
  }
  if (msg.type === 'card.fill') {
    sendResponse(cardFill(msg, send))
    return false
  }
  if (msg.type === 'activity') page().showActivity(msg.activity)
  if (msg.type === 'save.prompt') ask(msg.offer)
  return false
})

function ask(offer: SaveOffer): void {
  page().askSave(offer, (choice) => {
    if (choice === 'save') void send({ type: 'save.accept', id: offer.id })
    else void send({ type: 'save.dismiss', id: offer.id, never: choice === 'never' })
  })
}

async function offerSave(): Promise<void> {
  if (window !== window.top) return
  const offer = await send<SaveOffer | null>({ type: 'save.offer' })
  if (offer) {
    ask(offer)
    return
  }
  const card = await send<CardOffer | null>({ type: 'card.offer' })
  if (card) askCardSave(card, page(), send)
}

let lastSubmit = 0

/** Reads a submitted login and hands it to the background, which seals the password at once. */
function submitted(scope: ParentNode): void {
  const now = Date.now()
  if (now - lastSubmit < 1000) return
  if (cardSubmitted(scope, send)) {
    lastSubmit = now
    window.setTimeout(() => void offerSave(), 1500)
    return
  }
  const found = submission(scope)
  if (!found) return
  lastSubmit = now
  void send({
    type: 'save.candidate',
    url: location.href,
    username: found.username,
    password: found.password,
    title: document.title,
  }).then(() => {
    // Pages that sign in without leaving the page get the question here.
    window.setTimeout(() => void offerSave(), 1500)
  })
}

document.addEventListener(
  'submit',
  (e) => {
    if (e.target instanceof HTMLFormElement) submitted(e.target)
  },
  true,
)

document.addEventListener(
  'click',
  (e) => {
    const target =
      e.target instanceof Element ? e.target.closest('button, input[type=submit]') : null
    if (!target || !e.isTrusted) return
    const form = target.closest('form')
    submitted(form ?? document)
  },
  true,
)

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.isTrusted) {
      submitted(e.target.form ?? document)
    }
  },
  true,
)

void offerSave()
