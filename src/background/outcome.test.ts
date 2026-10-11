import { describe, expect, it } from 'vitest'
import { failed, notApproved, saved } from './outcome'
import { RelayError } from './relay'

const answer = (fields: object) => ({
  v: 1,
  request_id: 'r',
  decision: 'denied' as const,
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
