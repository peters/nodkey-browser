/**
 * Sign-in methods ("Sign-in methods" in the protocol, ADR-0010): what the phone says about how a
 * site is signed in to, the provider login (`via`) that Nodkey fills only on the provider's own
 * pages, the second step to choose, and the suggestion "Remember that <site> uses <provider>
 * sign-in?" after a sign-in with a provider.
 */

import { may_fill_via, same_site, second_step_pick, signin_site } from '../wasm/nodkey.js'
import type { MethodOffer, SigninPage, ToContent, ViaHint } from '../models/messages'
import type { Answer, SecondStep, SecondStepOrder, SignInMethod, Via } from '../models/protocol'
import { t } from '../i18n/t'
import { belongsTo, siteOf } from '../utils/site'
import { client, info, noteFill, publish } from './actions'
import { ask } from './agent'
import { failed, notApproved } from './outcome'
import * as store from './store'

/** The names people know. `other` uses the method's own `provider_name`. */
export const PROVIDERS: Readonly<Record<string, string>> = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
  microsoft: 'Microsoft',
  facebook: 'Facebook',
}

export function providerLabel(method: SignInMethod): string {
  if (method.provider === 'other') return method.provider_name ?? ''
  return PROVIDERS[method.provider ?? ''] ?? ''
}

/** How long a provider login waits for the provider's pages. */
export const HOLD_MS = 3 * 60_000

interface Held {
  /** The site the request was for: the provider login is never filled there. */
  target: string
  method: SignInMethod
  via: Via
  at: number
  hinted: boolean
}

/** Provider logins by tab. In memory only: never in storage (AGENTS.md). */
const held = new Map<number, Held>()

function live(tabId: number): Held | null {
  const h = held.get(tabId)
  if (h && Date.now() - h.at < HOLD_MS) return h
  held.delete(tabId)
  return null
}

/** Whether the held provider login may be filled on a page at `host`. */
function viaAllowed(host: string, h: Held): boolean {
  return may_fill_via(
    host,
    h.target,
    JSON.stringify(h.method),
    JSON.stringify({ account: h.via.account }),
  )
}

/** True when `host` is one of the provider's own sign-in hosts. */
export function isProviderHost(host: string, provider: string): boolean {
  if (!(provider in PROVIDERS)) return false
  const method = JSON.stringify({ kind: 'federated', provider })
  return may_fill_via(host, '', method, JSON.stringify({ account: { issuer: '', name: '' } }))
}

/** The provider whose own pages `host` is on, if any. */
function providerAt(host: string): string | null {
  return Object.keys(PROVIDERS).find((p) => isProviderHost(host, p)) ?? null
}

/**
 * Keeps what an approved login or code answer says about the site (no secret), and holds its
 * provider login for the provider's pages in this tab.
 */
export async function remember(site: string, answer: Answer, tabId: number): Promise<void> {
  if (answer.decision !== 'approved') return
  if (answer.method || answer.second_step) {
    const known: store.KnownSite = { at: Date.now() }
    if (answer.method) known.method = answer.method
    if (answer.second_step) known.order = answer.second_step
    const old = (await store.knownSites())[site]
    await store.setKnownSite(site, { ...old, ...known })
  }
  if (answer.method?.kind === 'federated' && answer.via) {
    held.set(tabId, {
      target: site,
      method: answer.method,
      via: answer.via,
      at: Date.now(),
      hinted: false,
    })
  }
}

export function forget(tabId: number): void {
  held.delete(tabId)
  codeNext.delete(tabId)
  void store.setProviderFlow(tabId, null)
}

/** The text that says how the person signs in to `site`, for an answer without a password. */
export function methodText(site: string, answer: Answer): string | null {
  const m = answer.method
  if (!m) return null
  switch (m.kind) {
    case 'federated': {
      const label = providerLabel(m)
      if (!label) return t('methodSso', site)
      return answer.via ? t('methodFederated', site, label) : t('methodFederatedOnly', site, label)
    }
    case 'passkey':
      return t('methodPasskey', site)
    case 'email_code':
      return t('methodEmailCode', site)
    case 'sso':
      return t('methodSso', site)
    case 'sms':
      return t('methodSms', site)
    case 'password':
      return null
  }
}

/** Tells the page how the person signs in, with a button for the provider's button. */
export async function showMethod(
  tabId: number,
  frameId: number | undefined,
  site: string,
  answer: Answer,
): Promise<boolean> {
  const message = methodText(site, answer)
  if (!message || !answer.method) return false
  await store.setActivity(tabId, {
    kind: 'login',
    state: 'approved',
    site,
    message,
    at: Date.now(),
  })
  const msg: ToContent = { type: 'method', site, message }
  if (answer.method.kind === 'federated' && answer.method.provider) {
    msg.provider = answer.method.provider
    msg.label = providerLabel(answer.method)
  }
  await chrome.tabs.sendMessage(tabId, msg, { frameId: frameId ?? 0 }).catch(() => undefined)
  return true
}

/** A code of the held provider login that is still valid, if any. */
function freshCode(h: Held): string | undefined {
  const now = Date.now()
  const { code, seconds_left: left, next_code: next, next_seconds_left: nextLeft } = h.via
  if (code && left !== undefined && now < h.at + (left - 2) * 1000) return code
  if (next && nextLeft !== undefined && now < h.at + (nextLeft - 2) * 1000) return next
  return undefined
}

/**
 * Fills the held provider login on the provider's own page without a new request. Returns false
 * when there is none for this page, so the caller asks the phone as usual.
 */
export async function fillFromVia(
  tabId: number,
  frameId: number,
  frameUrl: string,
  kind: 'login' | 'code',
): Promise<boolean> {
  const h = live(tabId)
  const host = siteOf(frameUrl)
  if (!h || !host || !viaAllowed(host, h)) return false
  const msg: ToContent = { type: 'fill', site: host }
  if (kind === 'login') {
    const username = h.via.username ?? h.via.account.name
    if (username) msg.username = username
    if (h.via.password !== undefined) msg.password = h.via.password
  } else {
    const code = freshCode(h)
    if (code === undefined) return false
    msg.code = code
  }
  const filled: unknown = await chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => false)
  const label = providerLabel(h.method)
  // Not offered for saving when the person submits it on the provider's page.
  if (msg.username !== undefined && msg.password !== undefined) {
    await noteFill(host, msg.username, msg.password)
  }
  if (filled !== true) {
    await publish(tabId, kind, host, 'error', t('actNoField'), frameId)
    return true
  }
  // The code was the last step; the password stays for a second password page until the hold ends.
  if (kind === 'code') held.delete(tabId)
  await publish(tabId, kind, host, 'approved', t('viaFilled', label), frameId)
  return true
}

/** A trusted click on "Sign in with <provider>" in the page of `tab`. */
export async function providerClicked(tab: chrome.tabs.Tab, provider: string): Promise<void> {
  const site = siteOf(tab.url ?? '')
  if (tab.id === undefined || !site || !(provider in PROVIDERS) || providerAt(site)) return
  await store.setProviderFlow(tab.id, { site, provider, at: Date.now(), visited: false })
}

/** The method the phone knows for `host`: its own entry, or the entry of a site it is below. */
async function known(host: string): Promise<store.KnownSite | null> {
  const all = await store.knownSites()
  const match = Object.keys(all)
    .filter((s) => host === s || host.endsWith(`.${s}`) || s.endsWith(`.${host}`))
    .sort((a, b) => b.length - a.length)[0]
  return match === undefined ? null : (all[match] ?? null)
}

/**
 * A top page loaded in `tab`: notes a visit to a provider, and returns the question to ask when
 * the person came back from the provider, and the hint for a held provider login.
 */
export async function page(tab: chrome.tabs.Tab, frameUrl: string): Promise<SigninPage> {
  const out: SigninPage = { offer: null, via: null, fillCode: false }
  const host = siteOf(frameUrl)
  if (tab.id === undefined || !host) return out
  out.fillCode = takeCodeNext(tab.id, frameUrl)
  const h = live(tab.id)
  if (h && !h.hinted && viaAllowed(host, h)) {
    h.hinted = true
    const hint: ViaHint = {
      site: h.target,
      label: providerLabel(h.method),
      username: h.via.username ?? h.via.account.name,
    }
    out.via = hint
  }
  const flows = await store.providerFlows()
  const provider = providerAt(host)
  if (provider) {
    // The sign-in with the provider may run in a window of its own: the newest flow counts.
    const newest = Object.entries(flows)
      .filter(([, f]) => f.provider === provider)
      .sort(([, a], [, b]) => b.at - a.at)[0]
    if (newest && !newest[1].visited) {
      await store.setProviderFlow(Number(newest[0]), { ...newest[1], visited: true })
    }
    return out
  }
  const flow = flows[String(tab.id)]
  if (!flow?.visited || !belongsTo(frameUrl, flow.site)) return out
  await store.setProviderFlow(tab.id, null)
  out.offer = await offerFor(flow.site, flow.provider)
  return out
}

async function offerFor(site: string, provider: string): Promise<MethodOffer | null> {
  const settings = await store.settings()
  if (!settings.offerSave || settings.neverSave.includes(site)) return null
  if (!(await store.currentPhone())) return null
  const k = await known(site)
  if (k?.method?.kind === 'federated' && k.method.provider === provider) return null
  return { site, provider, label: PROVIDERS[provider] ?? provider }
}

/** "Remember": sends the suggestion. It holds the site and the provider only, no secret. */
export async function suggest(tab: chrome.tabs.Tab, site: string, provider: string) {
  const tabId = tab.id
  const target = signin_site(site)
  const label = PROVIDERS[provider]
  if (tabId === undefined || !target || !label || !belongsTo(tab.url ?? '', site)) return
  const phone = await store.currentPhone()
  if (!phone) return publish(tabId, 'suggest', site, 'error', t('actNeedsPairing'))
  await publish(tabId, 'suggest', site, 'waiting', t('learnWaiting'))
  try {
    const { answer } = await ask(
      {
        kind: 'suggest',
        site: target,
        reason: t('reasonSuggest', site, label, info.browser),
        suggest: {
          method: { kind: 'federated', provider, certainty: 'seen', source: 'extension' },
          outcome: 'signed_in',
        },
        client: client(),
      },
      phone,
    )
    if (answer?.decision === 'queued') {
      await publish(tabId, 'suggest', site, 'approved', t('learnQueued'))
      return
    }
    const shown = notApproved(answer, 'suggest')
    await publish(tabId, 'suggest', site, shown.state, shown.message)
  } catch (e) {
    const shown = failed(e)
    await publish(tabId, 'suggest', site, shown.state, shown.message)
  }
}

/** "Not now" or "Never for this site" on the question. */
export async function dismiss(site: string, never: boolean): Promise<void> {
  if (!never) return
  const settings = await store.settings()
  if (!settings.neverSave.includes(site)) {
    await store.setSettings({ neverSave: [...settings.neverSave, site].sort() })
  }
}

/**
 * The second step order for a page: what the phone said for its site, or, on the provider's
 * page of a held provider login with a code, a Nodkey code. `null` when Nodkey knows nothing.
 */
async function orderFor(tabId: number, frameUrl: string): Promise<SecondStepOrder | null> {
  const host = siteOf(frameUrl)
  if (!host) return null
  const k = await known(host)
  if (k?.order) return k.order
  // The provider login has a code: Nodkey gives one (a fresh one with a new request).
  const h = live(tabId)
  if (h && viaAllowed(host, h) && h.via.code !== undefined) {
    return { prefer: ['totp'], avoid: ['app_prompt', 'sms'] }
  }
  return null
}

/** Whether to show the Nodkey button at a phone prompt: Nodkey has a passkey or a code. */
export async function stepAvailable(tabId: number, frameUrl: string): Promise<boolean> {
  const order = await orderFor(tabId, frameUrl)
  return order?.prefer.some((s) => s === 'passkey' || s === 'totp') ?? false
}

/** The step to choose among those the page offers, or `null` (only avoided steps). */
export async function stepPick(
  tabId: number,
  frameUrl: string,
  offered: SecondStep[],
): Promise<SecondStep | null> {
  const order = await orderFor(tabId, frameUrl)
  const pick = (second_step_pick(JSON.stringify(order), JSON.stringify(offered)) ??
    null) as SecondStep | null
  // The code page may load as a new page: it fills the code when it comes.
  if (pick === 'totp') codeNext.set(tabId, { at: Date.now(), url: frameUrl })
  return pick
}

/**
 * Tabs where Nodkey chose a code at a second step, with the page of the choice, for the code
 * page that follows.
 */
const codeNext = new Map<number, { at: number; url: string }>()

/**
 * Whether the page that loaded at `frameUrl` should fill a code now: once, within 30 seconds of
 * the choice, and only on the website of the choice. A page of another site that loads in the
 * tab in that time does not ask (issue #10).
 */
function takeCodeNext(tabId: number, frameUrl: string): boolean {
  const choice = codeNext.get(tabId)
  codeNext.delete(tabId)
  return choice !== undefined && Date.now() - choice.at < 30_000 && same_site(choice.url, frameUrl)
}

/** A code fill started: the choice is done. */
export function codeFilled(tabId: number): void {
  codeNext.delete(tabId)
}

/** Whether the phone said that `site`'s login has a Nodkey code (for the SMS choice). */
export async function prefersCode(site: string): Promise<boolean> {
  return (await known(site))?.order?.prefer.includes('totp') ?? false
}
