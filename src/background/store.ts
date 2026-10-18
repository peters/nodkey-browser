/**
 * Typed access to extension storage. `local` keeps public data across restarts (the agent's id
 * and name, paired phones' public keys, settings, saves waiting for the phone with their sealed
 * passwords). `session` lives in memory only and holds what the popup and pages show.
 */

import {
  type Activity,
  type CardOffer,
  DEFAULT_SETTINGS,
  type PairingState,
  type SaveOffer,
  type Settings,
} from '../models/messages'
import { type Phone, type SecondStepOrder, type SignInMethod, parsePhone } from '../models/protocol'

export interface Agent {
  agent_id: string
  name: string
}

async function getLocal<T>(key: string): Promise<T | undefined> {
  const v: Record<string, unknown> = await chrome.storage.local.get(key)
  return v[key] as T | undefined
}

async function getSession<T>(key: string): Promise<T | undefined> {
  const v: Record<string, unknown> = await chrome.storage.session.get(key)
  return v[key] as T | undefined
}

export async function agent(): Promise<Agent | null> {
  return (await getLocal<Agent>('agent')) ?? null
}

export async function setAgent(a: Agent | null): Promise<void> {
  if (a) await chrome.storage.local.set({ agent: a })
  else await chrome.storage.local.remove('agent')
}

export async function phones(): Promise<Phone[]> {
  const list = (await getLocal<unknown[]>('phones')) ?? []
  const out: Phone[] = []
  for (const p of list) {
    try {
      out.push(parsePhone(p))
    } catch {
      // A damaged entry is left out; pairing again replaces it.
    }
  }
  return out
}

export async function setPhones(list: Phone[]): Promise<void> {
  await chrome.storage.local.set({ phones: list })
}

/** The phone requests go to: the most recently paired one. */
export async function currentPhone(): Promise<Phone | null> {
  const list = await phones()
  return list.reduce<Phone | null>((a, p) => (a && a.paired_at >= p.paired_at ? a : p), null)
}

export async function settings(): Promise<Settings> {
  const stored = (await getLocal<Partial<Settings>>('settings')) ?? {}
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await settings()), ...patch }
  await chrome.storage.local.set({ settings: next })
  return next
}

/** Saves that wait for the phone, newest first. At most 20, none older than 7 days. */
export async function pending(): Promise<SaveOffer[]> {
  const list = (await getLocal<SaveOffer[]>('pending')) ?? []
  const fresh = Date.now() - 7 * 86_400_000
  return list.filter((o) => o.at >= fresh)
}

export async function setPending(list: SaveOffer[]): Promise<void> {
  const sorted = [...list].sort((a, b) => b.at - a.at).slice(0, 20)
  await chrome.storage.local.set({ pending: sorted })
}

export async function pairing(): Promise<PairingState> {
  return (await getSession<PairingState>('pairing')) ?? { state: 'idle' }
}

export async function setPairing(p: PairingState): Promise<void> {
  await chrome.storage.session.set({ pairing: p })
}

export async function activity(tabId: number): Promise<Activity | null> {
  return (await getSession<Activity>(`activity:${tabId}`)) ?? null
}

export async function setActivity(tabId: number, a: Activity): Promise<void> {
  await chrome.storage.session.set({ [`activity:${tabId}`]: a })
}

/** The save offer for a tab: shown once in the page after the person signed in. */
export async function offer(tabId: number): Promise<SaveOffer | null> {
  const o = await getSession<SaveOffer>(`offer:${tabId}`)
  // An offer is for the next few minutes only.
  return o && Date.now() - o.at < 5 * 60_000 ? o : null
}

export async function setOffer(tabId: number, o: SaveOffer | null): Promise<void> {
  if (o) await chrome.storage.session.set({ [`offer:${tabId}`]: o })
  else await chrome.storage.session.remove(`offer:${tabId}`)
}

/** The user name the person typed on a user name step, for the password step after it. */
export interface UsernameHint {
  site: string
  username: string
  at: number
}

export async function usernameHint(tabId: number): Promise<UsernameHint | null> {
  const h = await getSession<UsernameHint>(`username:${tabId}`)
  return h && Date.now() - h.at < 5 * 60_000 ? h : null
}

export async function setUsernameHint(tabId: number, h: UsernameHint): Promise<void> {
  await chrome.storage.session.set({ [`username:${tabId}`]: h })
}

/** The card save offer for a tab (its number and CVC sealed to the phone), for a few minutes. */
export async function cardOffer(tabId: number): Promise<CardOffer | null> {
  const o = await getSession<CardOffer>(`cardOffer:${tabId}`)
  return o && Date.now() - o.at < 5 * 60_000 ? o : null
}

export async function setCardOffer(tabId: number, o: CardOffer | null): Promise<void> {
  if (o) await chrome.storage.session.set({ [`cardOffer:${tabId}`]: o })
  else await chrome.storage.session.remove(`cardOffer:${tabId}`)
}

/**
 * What the phone said about how a site is signed in to: its first method and the second step
 * order, from approved login and code answers. No secret; for this browser session only.
 */
export interface KnownSite {
  method?: SignInMethod
  order?: SecondStepOrder
  at: number
}

export async function knownSites(): Promise<Record<string, KnownSite>> {
  return (await getSession<Record<string, KnownSite>>('known')) ?? {}
}

export async function setKnownSite(site: string, known: KnownSite): Promise<void> {
  const all = await knownSites()
  await chrome.storage.session.set({ known: { ...all, [site]: known } })
}

/** A click on "Sign in with <provider>" in a tab, until the person comes back signed in. */
export interface ProviderFlow {
  site: string
  provider: string
  at: number
  /** A page of the provider loaded after the click. */
  visited: boolean
}

export async function providerFlows(): Promise<Record<string, ProviderFlow>> {
  const all = (await getSession<Record<string, ProviderFlow>>('flows')) ?? {}
  // A flow is for the next ten minutes only.
  return Object.fromEntries(Object.entries(all).filter(([, f]) => Date.now() - f.at < 10 * 60_000))
}

export async function setProviderFlow(tabId: number, flow: ProviderFlow | null): Promise<void> {
  const others = Object.entries(await providerFlows()).filter(([id]) => id !== String(tabId))
  const all = Object.fromEntries(flow ? [...others, [String(tabId), flow]] : others)
  await chrome.storage.session.set({ flows: all })
}
