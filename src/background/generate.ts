/**
 * Make a strong password on the phone for a sign-up or a password change (peters/nodkey#131,
 * "Making a password" in the protocol). The phone asks the person with Face ID, makes a password
 * that fits the page's rules and saves it before it answers. The extension fills it into the new
 * password field and its repeat field and does not ask to save it again.
 */

import {
  generate_fill_only_on,
  generate_page,
  generate_rules_problem,
  may_fill,
} from '../wasm/nodkey.js'
import type { ToBackground, ToContent } from '../models/messages'
import type { Answer, PasswordRules } from '../models/protocol'
import { t } from '../i18n/t'
import { belongsTo, mayFill, siteOf } from '../utils/site'
import { client, info, publish } from './actions'
import { type Ask, ask } from './agent'
import { type Shown, failed, paused } from './outcome'
import { capture } from './screenshot'
import * as store from './store'

export type GenerateRequest = Extract<ToBackground, { type: 'generate' }>

/** The protocol's limits (`MAX_URL`, `MAX_USERNAME`, `MAX_TITLE`, `MAX_RULES`, `MAX_PATTERN`). */
const MAX_URL = 500
const MAX_USERNAME = 200
const MAX_TITLE = 100
const MAX_RULES = 300
const MAX_PATTERN = 300

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

/** A text without control characters, or `undefined` when it is empty or longer than `max`. */
function text(value: string | undefined, max: number): string | undefined {
  const v = value?.trim()
  return v && v.length <= max && !CONTROL.test(v) ? v : undefined
}

/** The rules as the protocol allows them: a rule that breaks a limit is left out. */
export function requestRules(rules: PasswordRules): PasswordRules {
  const out: PasswordRules = {}
  const passwordrules = text(rules.passwordrules, MAX_RULES)
  if (passwordrules) out.passwordrules = passwordrules
  const whole = (n: number | undefined) =>
    n !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : undefined
  const min = whole(rules.min_length)
  if (min !== undefined) out.min_length = min
  const max = whole(rules.max_length)
  if (max !== undefined) out.max_length = max
  const pattern = text(rules.pattern, MAX_PATTERN)
  if (pattern) out.pattern = pattern
  return out
}

/** The text for a request to make a password that did not give one. */
export function generateRefusal(answer: Answer | null): Shown {
  if (!answer || answer.decision === 'expired')
    return { state: 'expired', message: t('genExpired') }
  const byError: Partial<Record<string, Shown>> = {
    paused: { state: 'denied', message: paused(answer) },
    // A phone without a passcode makes no password (peters/nodkey#126).
    no_passcode: { state: 'denied', message: t('genNoPasscode') },
    not_allowed: { state: 'denied', message: t('genNotAllowed') },
    bad_rules: { state: 'error', message: t('genBadRules') },
    bad_generate: { state: 'error', message: t('genBadRequest') },
    save_failed: { state: 'error', message: t('genSaveFailed') },
    unsupported_version: { state: 'error', message: t('genOldApp') },
    unsupported_kind: { state: 'error', message: t('genOldApp') },
  }
  const known = answer.error === undefined ? undefined : byError[answer.error]
  if (known) return known
  if (answer.decision === 'approved') return { state: 'error', message: t('genBadRequest') }
  return { state: 'denied', message: t('genDenied') }
}

/**
 * An answer the extension may use (`generate::check_answer`): approved, with the password and
 * `saved`, and no lease other than `once` (the phone asks with Face ID every time). The password
 * does not go to the WebAssembly module for this check.
 */
function usable(answer: Answer | null): answer is Answer & { password: string } {
  return (
    answer?.decision === 'approved' &&
    !!answer.password &&
    (answer.saved === 'added' || answer.saved === 'updated') &&
    (!answer.lease || answer.lease.kind === 'once')
  )
}

/**
 * Asks the phone to make and save a password for the tab's page and fills it into the frame that
 * asked. The user name comes from the form, else from the user name step of the same sign-up in
 * this tab (kept in session memory for 5 minutes, ADR-0005).
 */
export async function generate(
  tab: chrome.tabs.Tab,
  frameId: number | undefined,
  frameUrl: string | undefined,
  req: GenerateRequest,
): Promise<void> {
  const tabId = tab.id
  if (tabId === undefined) return
  const url = tab.url ?? ''
  const site = siteOf(url)
  const kind = 'generate'
  if (!site) return publish(tabId, kind, '', 'error', t('siteNone'), frameId)
  if (!mayFill(url)) return publish(tabId, kind, site, 'error', t('siteInsecure'), frameId)
  // The host of the page, and the page without query and fragment (`generate::page`).
  const named = generate_page(url)
  if (!named) return publish(tabId, kind, site, 'error', t('siteNone'), frameId)
  const page = JSON.parse(named) as { target: string; url?: string }
  const target = page.target
  // Rules that no password can meet (`Rules::check`): said at once, nothing goes to the phone.
  const rules = requestRules(req.rules)
  if (generate_rules_problem(JSON.stringify(rules))) {
    return publish(tabId, kind, site, 'error', t('genBadRules'), frameId)
  }
  const phone = await store.currentPhone()
  if (!phone) return publish(tabId, kind, site, 'error', t('actNeedsPairing'), frameId)

  await publish(tabId, kind, site, 'waiting', t('genWaiting'), frameId)
  try {
    let username = text(req.username, MAX_USERNAME)
    if (!username) {
      const hinted = await store.usernameHint(tabId)
      if (hinted && (hinted.site === site || belongsTo(url, hinted.site))) {
        username = text(hinted.username, MAX_USERNAME)
      }
    }
    const generate: NonNullable<Ask['generate']> = {}
    if (page.url && page.url.length <= MAX_URL) generate.url = page.url
    if (username) generate.username = username
    const title = text(req.title?.slice(0, MAX_TITLE), MAX_TITLE)
    if (title) generate.title = title
    if (req.change) generate.change = true
    if (Object.keys(rules).length > 0) generate.rules = rules
    const settings = await store.settings()
    const request: Ask = {
      kind: 'generate',
      site: target,
      reason: t('reasonGenerate', site, info.browser),
      picture: settings.screenshots ? await capture(tab.windowId, site) : null,
      generate,
      client: client(),
    }
    const { answer } = await ask(request, phone)
    if (!usable(answer)) {
      const shown = generateRefusal(answer)
      await publish(tabId, kind, site, shown.state, shown.message, frameId)
      return
    }
    // Saved on the phone already: the save question does not come for this sign-up.
    await store.setGenerated(tabId, { site, at: Date.now() })
    const saved = answer.saved === 'updated' ? t('genUpdated') : t('genSaved')
    // Filled only on a page of the website of `target` (`fill_only_on`), in the frame that asked.
    if (!may_fill(frameUrl ?? url, generate_fill_only_on(target))) {
      await publish(tabId, kind, site, 'approved', t('genNoField'), frameId)
      return
    }
    const msg: ToContent = { type: 'fill.new', site, password: answer.password }
    if (answer.username) msg.username = answer.username
    const filled: unknown = await chrome.tabs
      .sendMessage(tabId, msg, frameId === undefined ? {} : { frameId })
      .catch(() => false)
    await publish(tabId, kind, site, 'approved', filled === true ? saved : t('genNoField'), frameId)
  } catch (e) {
    const shown = failed(e)
    await publish(tabId, kind, site, shown.state, shown.message, frameId)
  }
}
