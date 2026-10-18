import { describe, expect, it } from 'vitest'
import type { Answer } from '../models/protocol'
import { failed, notApproved, paused, quotaNote, saved } from './outcome'
import { RelayError } from './relay'

const answer = (fields: Partial<Answer>): Answer => ({
  v: 1,
  request_id: 'r',
  decision: 'denied',
  ...fields,
})

describe('outcome texts', () => {
  it('explains refusals', () => {
    expect(notApproved(null, 'login').state).toBe('expired')
    expect(notApproved(null, 'save').message).toContain('only your iPhone can read it')
    expect(notApproved(answer({ error: 'paused' }), 'code').message).toContain('paused')
    expect(notApproved(answer({ error: 'unsupported_version' }), 'code').state).toBe('error')
    expect(notApproved(answer({ error: 'unsupported_kind' }), 'save').message).toContain(
      'Update Nodkey',
    )
    expect(notApproved(answer({}), 'login').message).toContain('denied')
  })

  it('explains saves and errors', () => {
    expect(saved({ ...answer({}), decision: 'approved', saved: 'updated' }).message).toContain(
      'updated',
    )
    expect(failed(new RelayError(0, 'unreachable', '')).message).toContain('cannot reach')
    expect(failed(new RelayError(403, 'not_paired', '')).message).toContain('Pair again')
    expect(failed(new Error('boom')).message).toContain('boom')
  })
})

describe('what the person reads', () => {
  it('tells a pause by the person from a pause by the agent limit', () => {
    expect(paused(answer({ error: 'paused' }))).toBe(
      'Nodkey on your iPhone paused this browser. Resume it under Agents in Nodkey.',
    )
    expect(paused(answer({ error: 'paused', quota: { new_today: 26, limit: 10 } }))).toContain(
      'many new logins and codes today',
    )
  })

  it('gives the agent limit notice as a note, with any decision', () => {
    const warned = answer({
      decision: 'approved',
      error: 'quota_warning',
      quota: { new_today: 6, limit: 10, burst: true },
    })
    expect(quotaNote(warned)).toContain('6 new logins and codes today')
    expect(quotaNote(answer({ decision: 'approved' }))).toBeUndefined()
    const denied = notApproved({ ...warned, decision: 'denied' }, 'login')
    expect(denied.message).toBe('You denied the request on your iPhone.')
    expect(denied.note).toContain('Approve each request in the Nodkey app.')
  })

  it('names the SMS automation when no SMS code came, and stays calm on suggestions', () => {
    expect(notApproved(answer({ decision: 'expired' }), 'sms').message).toContain(
      'Shortcuts automation',
    )
    expect(notApproved(null, 'login').message).toBe('Your iPhone did not answer in time.')
    expect(
      notApproved(answer({ decision: 'rejected', error: 'rate_limited' }), 'suggest').message,
    ).toBe('Your iPhone did not take the suggestion now. You can try again later.')
    expect(notApproved(answer({ error: 'unsupported_kind' }), 'suggest').state).toBe('error')
  })
})
