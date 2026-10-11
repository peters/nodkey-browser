/**
 * The background of the extension (a service worker in Chromium, an event page in Firefox): it
 * holds the keys, talks to the relay and answers the popup, the options page and the pages.
 */

import init, { display_code } from '../wasm/nodkey.js'
import type { Reply, ToBackground } from '../models/messages'
import { t } from '../i18n/t'
import * as actions from './actions'
import { finishPairing, rememberPhone, startPairing, unpair } from './agent'
import { failed } from './outcome'
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

async function finish(run: number, code: string): Promise<void> {
  try {
    const phone = await finishPairing(code)
    if (run !== pairingRun) return
    if (!phone) {
      await store.setPairing({ state: 'error', message: t('pairExpired') })
      return
    }
    await rememberPhone(phone)
    await store.setPairing({
      state: 'check',
      check: phone.check,
      phoneName: phone.name,
      phoneId: phone.phone_id,
    })
  } catch (e) {
    if (run === pairingRun) {
      await store.setPairing({ state: 'error', message: t('pairFailed', failed(e).message) })
    }
  }
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
        void actions.fill(
          msg.type === 'fill.login' ? 'login' : 'code',
          tab,
          isExtensionPage(sender) ? undefined : sender.frameId,
        )
      }
      return null
    }
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
  }
  if (fromPage) throw new Error('not allowed from a web page')
  switch (msg.type) {
    case 'pair.start':
      await pair(msg.name)
      return null
    case 'pair.cancel':
      pairingRun++
      await store.setPairing({ state: 'idle' })
      return null
    case 'pair.confirm':
      await store.setPairing({ state: 'idle' })
      return null
    case 'pair.reject': {
      const p = await store.pairing()
      if (p.state === 'check') await unpair(p.phoneId)
      await store.setPairing({ state: 'error', message: t('pairDifferentDone') })
      return null
    }
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

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove([`activity:${tabId}`, `offer:${tabId}`, `username:${tabId}`])
})

// First install: open the settings page, which starts with pairing.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage()
})
