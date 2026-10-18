/** Turns a request's result or error into what the person reads. */

import type { ActivityKind, ActivityState } from '../models/messages'
import type { Answer } from '../models/protocol'
import { t } from '../i18n/t'
import { RelayError } from './relay'

export interface Shown {
  state: ActivityState
  message: string
  note?: string
}

/** The text for a pause: by the person, or by the agent limit (the answer then has `quota`). */
export function paused(answer: Answer): string {
  return answer.quota ? t('actPausedLimit') : t('actPaused')
}

/**
 * The agent limit's notice, when the phone asked because of it (`quota_warning`, with any
 * decision). It says why the phone asked; nothing failed.
 */
export function quotaNote(answer: Answer | null): string | undefined {
  if (answer?.error !== 'quota_warning') return undefined
  return t('actQuotaWarning', String(answer.quota?.new_today ?? ''))
}

/** The text for a request that did not get an approval (or failed). */
export function notApproved(answer: Answer | null, kind: ActivityKind): Shown {
  if (!answer || answer.decision === 'expired') {
    const message =
      kind === 'save' ? t('saveKept') : kind === 'sms' ? t('smsExpired') : t('actExpired')
    return { state: 'expired', message }
  }
  if (answer.error === 'paused') return { state: 'denied', message: paused(answer) }
  if (answer.error === 'unsupported_version' || answer.error === 'unsupported_kind')
    return { state: 'error', message: t('actOldProtocol') }
  if (kind === 'suggest') return { state: 'denied', message: t('learnRejected') }
  const shown: Shown = {
    state: 'denied',
    message: kind === 'save' ? t('saveDenied') : t('actDenied'),
  }
  const note = quotaNote(answer)
  if (note) shown.note = note
  return shown
}

/** The text for an approved save. */
export function saved(answer: Answer): Shown {
  const message =
    answer.saved === 'updated'
      ? t('saveUpdated')
      : answer.saved === 'unchanged'
        ? t('saveUnchanged')
        : t('saveAdded')
  return { state: 'approved', message }
}

/** The text for an error before or while waiting. */
export function failed(e: unknown): Shown {
  if (e instanceof RelayError) {
    if (e.status === 0) return { state: 'error', message: t('actUnreachable') }
    if (e.status === 403) return { state: 'error', message: t('actNotPaired') }
    if (e.status === 429) return { state: 'error', message: t('actRateLimited') }
  }
  const text = e instanceof Error ? e.message : String(e)
  return { state: 'error', message: t('actError', text) }
}

/** The text for a card request that did not get an approval. */
export function cardRefusal(answer: Answer | null): Shown {
  if (!answer || answer.decision === 'expired')
    return { state: 'expired', message: t('actExpired') }
  const byError: Partial<Record<string, Shown>> = {
    paused: { state: 'denied', message: paused(answer) },
    unsupported_version: { state: 'error', message: t('actOldProtocol') },
    unsupported_kind: { state: 'error', message: t('actOldProtocol') },
    cards_off: { state: 'denied', message: t('cardOff') },
    no_card: { state: 'denied', message: t('cardNone') },
    over_limit: { state: 'denied', message: t('cardOverLimit') },
    total_mismatch: { state: 'denied', message: t('cardTotalHigher') },
    amount_missing: { state: 'error', message: t('cardBadRequest') },
    bad_card_request: { state: 'error', message: t('cardBadRequest') },
  }
  const known = answer.error === undefined ? undefined : byError[answer.error]
  if (known) return known
  if (answer.decision === 'approved') return { state: 'error', message: t('cardBadRequest') }
  return { state: 'denied', message: t('cardDenied') }
}
