/**
 * Localized text from the extension's `_locales` (made from `src/i18n/messages/*.json` at build).
 * Outside the extension (tests), the English text is used.
 */

import en from './messages/en.json'

export type MessageKey = keyof typeof en

export function t(key: MessageKey, ...subs: string[]): string {
  const fromBrowser =
    typeof chrome !== 'undefined' && 'i18n' in chrome ? chrome.i18n.getMessage(key, subs) : ''
  if (fromBrowser) return fromBrowser
  return subs.reduce((text, sub, i) => text.replaceAll(`$${i + 1}`, sub), en[key])
}

/** The UI language, e.g. "nb" or "en". */
export function uiLanguage(): string {
  if (typeof chrome !== 'undefined' && 'i18n' in chrome) {
    return chrome.i18n.getUILanguage()
  }
  return 'en'
}
