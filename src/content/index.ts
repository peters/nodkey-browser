/**
 * Runs in every page and frame: shows the Nodkey button in sign-in and code fields, fills what
 * the phone sent, and notices a submitted login so the person can save it in Nodkey.
 */

import type { CardOffer, Reply, SaveOffer, ToBackground, ToContent } from '../models/messages'
import { t } from '../i18n/t'
import { belongsTo, mayFill } from '../utils/site'
import {
  askCardSave,
  cardClear,
  cardFill,
  cardParts,
  cardSubmitted,
  isCardField,
  startPay,
  totalNow,
  watchTotal,
} from './pay'
import { fillCode, setValue } from './fill'
import { findLogin, findOtp, isOtpField, submission } from './forms'
import { fillNew, newFormOf, newNameField, openMenu } from './generate'
import { smsPage } from './signin'
import { noteClick, pageLoaded, showMethod, watchPrompt } from './steps'
import { PageUi } from './ui'

let ui: PageUi | null = null

/**
 * Nodkey's layer in the page. It is made only when there is something to show (a field got the
 * focus, a card or a question), so a page cannot see from a load alone that Nodkey is installed.
 */
function page(): PageUi {
  ui ??= new PageUi((field) => {
    if (isCardField(field)) {
      // A card field in a frame below the top page (a payment provider's frame, for example):
      // the top page shows the card, with the shop of the address bar and its total.
      if (window === window.top) startPay(field, page(), send)
      else void send({ type: 'card.start' })
      return
    }
    if (isOtpField(field) || boxRow(field)) {
      // A code the site sent by SMS comes through the person's Shortcuts automation on the phone.
      void send({ type: smsPage(document) ? 'fill.sms' : 'fill.code' })
      return
    }
    // A field for a new password: make one on the phone, or (second) use a saved login.
    const form = newFormOf(field)
    if (form) {
      openMenu(form, page(), send, fillLogin)
      return
    }
    fillLogin()
  })
  return ui
}

/** Asks for a saved login. A user name already in the form (typed or filled) names the account. */
function fillLogin(): void {
  const username = findLogin(document)?.username?.value.trim()
  void send(username ? { type: 'fill.login', username } : { type: 'fill.login' })
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

/** A field got the focus: the Nodkey button for a sign-in, code or card field. */
function focused(target: EventTarget | null): void {
  if (isCardField(target) && mayFill(location.href)) {
    page().showKey(target, target, t('cardButton'))
  } else if (isLoginField(target) && mayFill(location.href)) {
    if (newFormOf(target)) {
      page().showKey(target, target, t('genButton'), true)
      return
    }
    const code = isOtpField(target) || boxRow(target) !== null
    // A new user name: nothing to fill; the name goes on to the password step (issue #14).
    if (!code && newNameField(target)) return
    const label = code && smsPage(document) ? t('smsButton') : t('fieldButton')
    page().showKey(target, boxRow(target)?.at(-1) ?? target, label)
  }
}

document.addEventListener(
  'focusin',
  (e) => {
    focused(e.target)
  },
  true,
)
// A field that had the focus before this script ran (it runs when the page is loaded).
focused(document.activeElement)

document.addEventListener(
  'focusout',
  () => {
    // Later, so a click on the button still finds its field.
    window.setTimeout(() => {
      const active = document.activeElement
      // The menu of the Nodkey button has the focus: it stays.
      if (ui?.menuHasFocus()) return
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
  if (msg.type === 'fill.new') {
    if (!fillNew(msg)) return false // Only the frame that asked fills.
    sendResponse(true)
    return false
  }
  if (msg.type === 'card.fill') {
    sendResponse(cardFill(msg, send))
    return false
  }
  if (msg.type === 'card.total') {
    if (window !== window.top) return false
    sendResponse(totalNow())
    return false
  }
  if (msg.type === 'card.ask' && window === window.top) startPay(null, page(), send, msg)
  if (msg.type === 'card.watch' && window === window.top) watchTotal(null, msg.approved, send)
  if (msg.type === 'card.parts') cardParts(msg)
  if (msg.type === 'card.clear') cardClear(msg)
  if (msg.type === 'activity') page().showActivity(msg.activity)
  if (msg.type === 'method') showMethod(msg, page())
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
  if (card) {
    askCardSave(card, page(), send)
    return
  }
  await pageLoaded(page, send)
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
    noteClick(e, send)
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

// A phone prompt of a second step may come without a page load; look again when the page changes.
let promptTimer = 0
const lookForPrompt = () => {
  window.clearTimeout(promptTimer)
  promptTimer = window.setTimeout(() => void watchPrompt(page, send), 400)
}
if (window === window.top) {
  new MutationObserver(lookForPrompt).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  lookForPrompt()
}
