/**
 * The background of the extension (a service worker in Chromium, an event page in Firefox): it
 * holds the keys, talks to the relay and answers the popup, the options page and the pages.
 */

import init, { display_code } from '../wasm/nodkey.js'
import type { Reply, ToBackground } from '../models/messages'
import { relayAddressOk } from '../utils/relay'
import { t } from '../i18n/t'
import * as actions from './actions'
import * as cards from './cards'
import { PairingError, finishPairing, leave, rememberPhone, startPairing, unpair } from './agent'
import { failed } from './outcome'
import { answer as answerPasskey, syncPasskeyScripts } from './passkeys'
import * as signin from './signin'
import * as store from './store'

const ready = init()

/** Bumps for each new pairing, so a cancelled one cannot finish later. */
let pairingRun = 0

async function pair(name: string): Promise<void> {
  const run = ++pairingRun
  await store.setPairing({ state: 'starting', name })
  try {
    const { code, expires } = await startPairing(name.trim().slice(0, 64))
    if (run !== pairingRun) return
    await store.setPairing({
      state: 'waiting',
      code: display_code(code),
      expiresAt: expires * 1000,
      name,
    })
    void finish(run, code)
  } catch (e) {
    if (run === pairingRun) {
      await store.setPairing({ state: 'error', message: t('pairFailed', failed(e).message) })
    }
  }
}

/** How long a pairing waits for the person to compare the numbers (as the command line). */
const CONFIRM_MS = 10 * 60_000

async function finish(run: number, code: string): Promise<void> {
  try {
    const phone = await finishPairing(code)
    if (run !== pairingRun) {
      if (phone) await leave(phone.phone_id)
      return
    }
    if (!phone) {
      await store.setPairing({ state: 'error', message: t('pairExpired') })
      return
    }
    // Kept only after the person confirms that both screens show the same number.
    await store.setPairing({
      state: 'check',
      check: phone.check,
      phoneName: phone.name,
      phoneId: phone.phone_id,
      phone,
      until: Date.now() + CONFIRM_MS,
    })
  } catch (e) {
    if (run === pairingRun) await store.setPairing({ state: 'error', message: pairingFailed(e) })
  }
}

function pairingFailed(e: unknown): string {
  if (e instanceof PairingError) return t(e.code === 'old_app' ? 'pairOldApp' : 'pairCheckFailed')
  return t('pairFailed', failed(e).message)
}

/** The person compared the numbers: keep the phone when they are the same, else leave it. */
async function confirm(same: boolean): Promise<void> {
  const p = await store.pairing()
  if (p.state !== 'check') {
    await store.setPairing({ state: 'idle' })
    return
  }
  if (same && Date.now() <= p.until) {
    await rememberPhone(p.phone)
    await store.setPairing({ state: 'idle' })
    return
  }
  await leave(p.phoneId)
  await store.setPairing({
    state: 'error',
    message: same ? t('pairConfirmLate') : t('pairDifferentDone'),
  })
}

/** True for the popup and the options page; false for content scripts in web pages. */
function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.startsWith(chrome.runtime.getURL('')) === true
}

async function tabOf(
  msgTabId: number | undefined,
  sender: chrome.runtime.MessageSender,
): Promise<chrome.tabs.Tab | undefined> {
  if (!isExtensionPage(sender)) return sender.tab
  if (msgTabId === undefined) return undefined
  return chrome.tabs.get(msgTabId)
}

async function handle(msg: ToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await ready
  // Only this extension's own pages (the popup, the options page, also when opened in a tab) may
  // steer pairing, settings and unpairing; content scripts run in web pages.
  const fromPage = !isExtensionPage(sender)
  switch (msg.type) {
    case 'status':
      return actions.status(isExtensionPage(sender) ? msg.tabId : sender.tab?.id)
    case 'fill.login':
    case 'fill.code': {
      const tab = await tabOf(msg.tabId, sender)
      if (tab) {
        // Answer at once; the result arrives as the tab's activity.
        const page = !isExtensionPage(sender)
        void actions.fill(
          msg.type === 'fill.login' ? 'login' : 'code',
          tab,
          page ? sender.frameId : undefined,
          msg.type === 'fill.login' ? msg.username : undefined,
          page ? sender.url : undefined,
        )
      }
      return null
    }
    case 'fill.sms':
      if (sender.tab && !isExtensionPage(sender)) {
        void actions.fill('sms', sender.tab, sender.frameId, undefined, sender.url)
      }
      return null
    case 'signin.clicked':
      if (sender.tab) await signin.providerClicked(sender.tab, msg.provider)
      return null
    case 'signin.page':
      return sender.tab && sender.url ? signin.page(sender.tab, sender.url) : null
    case 'signin.suggest':
      if (sender.tab) void signin.suggest(sender.tab, msg.site, msg.provider)
      return null
    case 'signin.dismiss':
      await signin.dismiss(msg.site, msg.never)
      return null
    case 'step.available':
      return sender.tab?.id !== undefined && sender.url
        ? signin.stepAvailable(sender.tab.id, sender.url)
        : false
    case 'step.pick':
      return sender.tab?.id !== undefined && sender.url
        ? signin.stepPick(sender.tab.id, sender.url, msg.offered)
        : null
    case 'save.candidate':
      if (sender.tab && sender.url) {
        await actions.candidate(sender.tab, sender.url, msg.username, msg.password, msg.title)
      }
      return null
    case 'save.offer':
      return sender.tab && sender.url ? actions.takeOffer(sender.tab, sender.url) : null
    case 'save.accept':
      if (sender.tab) void actions.acceptOffer(sender.tab, msg.id)
      return null
    case 'save.dismiss':
      if (sender.tab) await actions.dismissOffer(sender.tab, msg.id, msg.never)
      return null
    case 'card.start':
      if (sender.tab && sender.url && !isExtensionPage(sender)) {
        await cards.start(sender.tab, sender.frameId ?? 0, sender.url)
      }
      return null
    case 'card.fill':
      // Answer at once; the result arrives as the tab's activity. Only from the page's own frame.
      if (sender.tab && sender.url && !isExtensionPage(sender)) {
        void cards.fill(sender.tab, sender.frameId ?? 0, sender.url, msg)
      }
      return null
    case 'card.cleared':
      if (sender.tab && sender.url)
        await cards.cleared(sender.tab, sender.frameId, sender.url, msg.total)
      return null
    case 'card.candidate':
      if (sender.tab && sender.url) await cards.candidate(sender.tab, sender.url, msg)
      return null
    case 'card.offer':
      return sender.tab && sender.url ? cards.takeOffer(sender.tab, sender.url) : null
    case 'card.accept':
      if (sender.tab) void cards.acceptOffer(sender.tab, msg.id)
      return null
    case 'card.dismiss':
      if (sender.tab) await cards.dismissOffer(sender.tab, msg.id, msg.never)
      return null
  }
  if (fromPage) throw new Error('not allowed from a web page')
  switch (msg.type) {
    case 'pair.start':
      await pair(msg.name)
      return null
    case 'pair.cancel': {
      pairingRun++
      const p = await store.pairing()
      if (p.state === 'check') await leave(p.phoneId)
      await store.setPairing({ state: 'idle' })
      return null
    }
    case 'pair.confirm':
      await confirm(true)
      return null
    case 'pair.reject':
      await confirm(false)
      return null
    case 'save.retry':
      void actions.retryPending(msg.id, msg.tabId)
      return null
    case 'save.discard':
      await actions.discardPending(msg.id)
      return null
    case 'unpair':
      await unpair(msg.phoneId)
      return null
    case 'settings.set':
      if (msg.patch.relay !== undefined && !relayAddressOk(msg.patch.relay)) {
        throw new Error('the relay address must start with https://')
      }
      return store.setSettings(msg.patch)
    case 'agent.rename': {
      const agent = await store.agent()
      const name = msg.name.trim().slice(0, 64)
      if (agent && name) await store.setAgent({ ...agent, name })
      return null
    }
  }
}

chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  handle(msg, sender).then(
    (value) => {
      sendResponse({ ok: true, value } satisfies Reply<unknown>)
    },
    (e: unknown) => {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    },
  )
  return true
})

// Passkey calls come from the bridge content script on a port of their own; a closed port (the
// page went away or aborted) cancels the wait for the phone.
chrome.runtime.onConnect.addListener((port) => {
  const sender = port.sender
  if (port.name !== 'passkey' || sender?.id !== chrome.runtime.id || !sender.tab) return
  if (isExtensionPage(sender)) {
    port.disconnect()
    return
  }
  const controller = new AbortController()
  let started = false
  port.onDisconnect.addListener(() => {
    controller.abort()
  })
  port.onMessage.addListener((msg: { call?: unknown; sameOriginAncestors?: unknown }) => {
    if (started) return
    started = true
    void ready
      .then(() => answerPasskey(msg, sender, controller.signal))
      .then((reply) => {
        if (!controller.signal.aborted) port.postMessage(reply)
      })
  })
})

// The passkey scripts follow the setting and the pairing.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('settings' in changes || 'phones' in changes)) {
    void syncPasskeyScripts()
  }
})
void syncPasskeyScripts()

chrome.tabs.onRemoved.addListener((tabId) => {
  signin.forget(tabId)
  void chrome.storage.session.remove([
    `activity:${tabId}`,
    `offer:${tabId}`,
    `username:${tabId}`,
    `cardOffer:${tabId}`,
  ])
})

// First install: open the settings page, which starts with pairing.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage()
})
