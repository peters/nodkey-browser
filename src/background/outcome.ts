/** Turns a request's result or error into what the person reads. */

import type { ActivityKind, ActivityState } from '../models/messages'
import type { Answer } from '../models/protocol'
import { t } from '../i18n/t'
import { RelayError } from './relay'

export interface Shown {
  state: ActivityState
  message: string
}

/** The text for a request that did not get an approval (or failed). */
export function notApproved(answer: Answer | null, kind: ActivityKind): Shown {
  if (!answer || answer.decision === 'expired') {
    return { state: 'expired', message: kind === 'save' ? t('saveKept') : t('actExpired') }
  }
  if (answer.error === 'paused') return { state: 'denied', message: t('actPaused') }
  if (answer.error === 'unsupported_version' || answer.error === 'unsupported_kind')
    return { state: 'error', message: t('actOldProtocol') }
  return { state: 'denied', message: kind === 'save' ? t('saveDenied') : t('actDenied') }
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
