/**
 * The extension's actions: fill a login or code into a page, offer to save a login the person
 * just used, and send saves. Each publishes its progress as the tab's activity.
 */

import { random_id, seal_password } from '../wasm/nodkey.js'
import type { ActivityKind, SaveOffer, Status, ToContent } from '../models/messages'
import { type Phone, parseSealedBox } from '../models/protocol'
import { t } from '../i18n/t'
import { browserInfo, defaultAgentName } from '../utils/browser'
import { belongsTo, mayFill, requestTarget, siteOf } from '../utils/site'
import { type ClientInfo, ask } from './agent'
import { failed, notApproved, saved } from './outcome'
import { capture } from './screenshot'
import * as store from './store'

export const info = browserInfo(navigator.userAgent)

export function client(): ClientInfo {
  return {
    app: `Nodkey for ${info.browser}`,
    app_version: chrome.runtime.getManifest().version,
    os: info.system,
  }
}

export async function agentName(): Promise<string> {
  return (await store.agent())?.name ?? defaultAgentName(info)
}

export async function publish(
  tabId: number,
  kind: ActivityKind,
  site: string,
  state: 'waiting' | 'approved' | 'denied' | 'expired' | 'error',
  message: string,
  frameId?: number,
): Promise<void> {
  const activity = { kind, state, site, message, at: Date.now() }
  await store.setActivity(tabId, activity)
  const msg: ToContent = { type: 'activity', activity }
  const options = frameId === undefined ? { frameId: 0 } : { frameId }
  chrome.tabs.sendMessage(tabId, msg, options).catch(() => {
    // The page may have no content script (a browser page); the popup shows the activity.
  })
}

/** What the popup and options page show. */
export async function status(tabId: number | undefined): Promise<Status> {
  const tab = tabId === undefined ? undefined : await chrome.tabs.get(tabId).catch(() => undefined)
  const url = tab?.url ?? ''
  const pending = await store.pending()
  return {
    agentName: await agentName(),
    phones: await store.phones(),
    site: siteOf(url),
    canFill: mayFill(url),
    activity: tabId === undefined ? null : await store.activity(tabId),
    pending,
    pairing: await store.pairing(),
    settings: await store.settings(),
    siteAccess: await chrome.permissions.contains({ origins: ['<all_urls>'] }),
  }
}

/** Logins Nodkey filled in the last two minutes: not offered for saving again. */
const recentFills = new Map<string, number>()

async function fillKey(site: string, username: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${site}\n${username}\n${password}`),
  )
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Asks the phone for a login or a code for the tab's site and fills it into the page. A known user
 * name (from the page, or the sign-in just submitted on this tab) names the account.
 */
export async function fill(
  kind: 'login' | 'code',
  tab: chrome.tabs.Tab,
  frameId?: number,
  username?: string,
) {
  const tabId = tab.id
  if (tabId === undefined) return
  const url = tab.url ?? ''
  const site = siteOf(url)
  if (!site) return publish(tabId, kind, '', 'error', t('siteNone'), frameId)
  if (!mayFill(url)) return publish(tabId, kind, site, 'error', t('siteInsecure'), frameId)
  const phone = await store.currentPhone()
  if (!phone) return publish(tabId, kind, site, 'error', t('actNeedsPairing'), frameId)

  await publish(tabId, kind, site, 'waiting', t('actWaiting'), frameId)
  try {
    const settings = await store.settings()
    const picture = settings.screenshots ? await capture(tab.windowId, site) : null
    const reason = t(kind === 'login' ? 'reasonLogin' : 'reasonCode', site, info.browser)
    let account = username
    if (!account && kind === 'code') {
      const hinted = await store.usernameHint(tabId)
      if (hinted && (hinted.site === site || belongsTo(url, hinted.site))) account = hinted.username
    }
    const target = requestTarget(site, account)
    const { answer } = await ask({ kind, site: target, reason, picture, client: client() }, phone)
    if (answer?.decision !== 'approved') {
      const shown = notApproved(answer, kind)
      await publish(tabId, kind, site, shown.state, shown.message, frameId)
      return
    }
    if (kind === 'login' && !answer.password) {
      await publish(tabId, kind, site, 'error', t('actNoPassword', site), frameId)
      return
    }
    const msg: ToContent = { type: 'fill', site }
    if (kind === 'login') {
      if (answer.username !== undefined) msg.username = answer.username
      if (answer.password !== undefined) msg.password = answer.password
      if (answer.code !== undefined) msg.code = answer.code
      if (answer.password) {
        recentFills.set(await fillKey(site, answer.username ?? '', answer.password), Date.now())
      }
    } else if (answer.code !== undefined) {
      msg.code = answer.code
    }
    // Frames without a matching field do not answer; the first frame that filled does.
    const filled: unknown = await chrome.tabs
      .sendMessage(tabId, msg, frameId === undefined ? {} : { frameId })
      .catch(() => false)
    if (filled !== true) {
      await publish(tabId, kind, site, 'error', t('actNoField'), frameId)
      return
    }
    const done = kind === 'login' ? t('actFilledLogin', site) : t('actFilledCode', site)
    await publish(tabId, kind, site, 'approved', done, frameId)
  } catch (e) {
    const shown = failed(e)
    await publish(tabId, kind, site, shown.state, shown.message, frameId)
  }
}

/** A login the person submitted in a page: sealed to the phone at once, then offered for saving. */
export async function candidate(
  tab: chrome.tabs.Tab,
  frameUrl: string,
  // Filled from the user name step when the password page has no user name field.
  username: string,
  password: string,
  title: string | undefined,
): Promise<void> {
  const tabId = tab.id
  const site = siteOf(frameUrl)
  if (tabId === undefined || !site || !mayFill(frameUrl)) return
  // A user name step: remember the name for the password step on the next page.
  if (!password) {
    if (username) await store.setUsernameHint(tabId, { site, username, at: Date.now() })
    return
  }
  if (!username) {
    const hinted = await store.usernameHint(tabId)
    if (hinted && (hinted.site === site || belongsTo(frameUrl, hinted.site))) {
      username = hinted.username
    }
  }
  if (!username) return
  const settings = await store.settings()
  if (!settings.offerSave || settings.neverSave.includes(site)) return
  const [agent, phone] = [await store.agent(), await store.currentPhone()]
  if (!agent || !phone) return
  const key = await fillKey(site, username, password)
  const filledAt = recentFills.get(key)
  if (filledAt !== undefined && Date.now() - filledAt < 120_000) return
  const box = parseSealedBox(JSON.parse(seal_password(agent.agent_id, phone.kem, password)))
  const page = new URL(frameUrl)
  const offer: SaveOffer = {
    id: random_id(),
    phoneId: phone.phone_id,
    site,
    url: page.origin + page.pathname,
    username,
    password: box,
    at: Date.now(),
  }
  if (title) offer.title = title.slice(0, 100)
  await store.setOffer(tabId, offer)
}

/** The save offer for a page that loaded in `tab`, once. */
export async function takeOffer(tab: chrome.tabs.Tab, frameUrl: string): Promise<SaveOffer | null> {
  if (tab.id === undefined) return null
  const offer = await store.offer(tab.id)
  if (!offer || offer.shown || !belongsTo(frameUrl, offer.site)) return null
  await store.setOffer(tab.id, { ...offer, shown: true })
  return offer
}

async function sendSave(offer: SaveOffer, tabId: number | undefined): Promise<void> {
  const phone: Phone | undefined = (await store.phones()).find((p) => p.phone_id === offer.phoneId)
  const show = async (
    state: 'waiting' | 'approved' | 'denied' | 'expired' | 'error',
    message: string,
  ) => {
    if (tabId !== undefined) await publish(tabId, 'save', offer.site, state, message)
  }
  const keep = async (keepIt: boolean) => {
    const rest = (await store.pending()).filter((o) => o.id !== offer.id)
    await store.setPending(keepIt ? [{ ...offer, shown: true }, ...rest] : rest)
  }
  if (!phone) {
    await keep(false)
    return show('error', t('actNotPaired'))
  }
  await show('waiting', t('saveWaiting'))
  try {
    const save: { url: string; username: string; title?: string; password: typeof offer.password } =
      {
        url: offer.url,
        username: offer.username,
        password: offer.password,
      }
    if (offer.title) save.title = offer.title
    const { answer } = await ask(
      {
        kind: 'save',
        site: offer.site,
        reason: t('reasonSave', offer.site, info.browser),
        save,
        client: client(),
      },
      phone,
    )
    if (answer?.decision === 'approved') {
      await keep(false)
      const shown = saved(answer)
      await show(shown.state, shown.message)
      return
    }
    const shown = notApproved(answer, 'save')
    // Kept, sealed, when the phone did not answer; dropped when the person said no.
    await keep(shown.state === 'expired')
    await show(shown.state, shown.message)
  } catch (e) {
    await keep(true)
    const shown = failed(e)
    await show(shown.state, shown.message)
  }
}

export async function acceptOffer(tab: chrome.tabs.Tab, id: string): Promise<void> {
  if (tab.id === undefined) return
  const offer = await store.offer(tab.id)
  if (offer?.id !== id) return
  await store.setOffer(tab.id, null)
  await sendSave(offer, tab.id)
}

export async function dismissOffer(tab: chrome.tabs.Tab, id: string, never: boolean) {
  if (tab.id === undefined) return
  const offer = await store.offer(tab.id)
  if (offer?.id !== id) return
  await store.setOffer(tab.id, null)
  if (never) {
    const settings = await store.settings()
    if (!settings.neverSave.includes(offer.site)) {
      await store.setSettings({ neverSave: [...settings.neverSave, offer.site].sort() })
    }
  }
}

export async function retryPending(id: string, tabId: number | undefined): Promise<void> {
  const offer = (await store.pending()).find((o) => o.id === id)
  if (offer) await sendSave(offer, tabId)
}

export async function discardPending(id: string): Promise<void> {
  await store.setPending((await store.pending()).filter((o) => o.id !== id))
}
