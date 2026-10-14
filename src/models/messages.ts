/**
 * Messages between the popup, the options page, the content script and the background, and the
 * state the background publishes in `chrome.storage.session` for the pages to show.
 */

import type { Money, Phone, Saved, SealedBox } from './protocol'

/** What a request is about, as the person sees it. */
export type ActivityKind = 'login' | 'code' | 'save' | 'passkey' | 'card'

export type ActivityState = 'waiting' | 'approved' | 'denied' | 'expired' | 'error'

/** The last request for one tab, shown in the popup and as a toast in the page. */
export interface Activity {
  kind: ActivityKind
  state: ActivityState
  site: string
  /** Localized text for the person. */
  message: string
  at: number
}

export type PairingState =
  | { state: 'idle' }
  | { state: 'starting'; name: string }
  | { state: 'waiting'; code: string; expiresAt: number; name: string }
  | { state: 'check'; check: string; phoneName: string; phoneId: string }
  | { state: 'error'; message: string }

/** A login the person may save in Nodkey. The password is sealed to the phone already. */
export interface SaveOffer {
  id: string
  phoneId: string
  site: string
  url: string
  username: string
  title?: string
  password: SealedBox
  at: number
  /** The page asked for it once already. */
  shown?: boolean
}

/** A card the person typed, sealed to the phone at once, waiting for "Save card in Nodkey". */
export interface CardOffer {
  id: string
  phoneId: string
  site: string
  url: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  holder?: string
  number: SealedBox
  cvc?: SealedBox
  at: number
  shown?: boolean
}

/** The card the background sends a frame to fill, with the most the person approved. */
export interface CardToFill {
  number: string
  exp_month: number
  exp_year: number
  cvc?: string
  holder?: string
}

export interface Settings {
  relay: string
  screenshots: boolean
  offerSave: boolean
  neverSave: string[]
  /** Answer the passkey requests of web pages with passkeys from the phone. */
  passkeys: boolean
}

export const DEFAULT_RELAY = 'https://relay.nodkey.app'

export const DEFAULT_SETTINGS: Settings = {
  relay: DEFAULT_RELAY,
  screenshots: true,
  offerSave: true,
  neverSave: [],
  passkeys: true,
}

/** What the popup and options page need to draw themselves. */
export interface Status {
  agentName: string | null
  phones: Phone[]
  site: string | null
  canFill: boolean
  activity: Activity | null
  pending: SaveOffer[]
  pairing: PairingState
  settings: Settings
  siteAccess: boolean
}

/** Requests to the background. `tabId` is set by the popup; the content script's tab is known. */
export type ToBackground =
  | { type: 'status'; tabId?: number }
  | { type: 'pair.start'; name: string }
  | { type: 'pair.cancel' }
  | { type: 'pair.confirm' }
  | { type: 'pair.reject' }
  | { type: 'fill.login'; tabId?: number; username?: string }
  | { type: 'fill.code'; tabId?: number }
  | { type: 'save.candidate'; url: string; username: string; password: string; title?: string }
  | { type: 'save.offer' }
  | { type: 'save.accept'; id: string }
  | { type: 'save.dismiss'; id: string; never: boolean }
  | { type: 'save.retry'; id: string; tabId?: number }
  | { type: 'save.discard'; id: string }
  | { type: 'card.fill'; amount: Money; pageTotal: Money | null; totalSource: 'page' | 'user' }
  | { type: 'card.cleared'; total: Money }
  | {
      type: 'card.candidate'
      url: string
      number: string
      exp_month: number
      exp_year: number
      cvc?: string
      holder?: string
    }
  | { type: 'card.offer' }
  | { type: 'card.accept'; id: string }
  | { type: 'card.dismiss'; id: string; never: boolean }
  | { type: 'unpair'; phoneId: string }
  | { type: 'settings.set'; patch: Partial<Settings> }
  | { type: 'agent.rename'; name: string }

/** Requests from the background to a content script. */
export type ToContent =
  | { type: 'fill'; site: string; username?: string; password?: string; code?: string }
  | { type: 'activity'; activity: Activity }
  | { type: 'save.prompt'; offer: SaveOffer }
  | { type: 'card.fill'; site: string; card: CardToFill; approved: Money }

/** A frame's answer to `card.fill`. */
export type CardFillResult =
  { filled: true } | { filled: false; reason: 'no_field' | 'total_higher' | 'other_site' }

export interface SaveResult {
  saved: Saved
}

export type Reply<T> = { ok: true; value: T } | { ok: false; error: string }
