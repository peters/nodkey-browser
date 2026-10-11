import { describe, expect, it } from 'vitest'
import { ProtocolError, parseAnswer, parseClaimed, parsePhone, parseSealedBox } from './protocol'

describe('protocol checks', () => {
  it('reads an answer and drops unknown fields', () => {
    const a = parseAnswer(
      JSON.stringify({
        v: 1,
        request_id: 'r',
        decision: 'approved',
        account: { issuer: 'VG', name: 'alex', site: 'vg.no' },
        username: 'alex',
        password: 'pw',
        saved: 'updated',
        extra: 'x',
      }),
    )
    expect(a).toEqual({
      v: 1,
      request_id: 'r',
      decision: 'approved',
      account: { issuer: 'VG', name: 'alex', site: 'vg.no' },
      username: 'alex',
      password: 'pw',
      saved: 'updated',
    })
  })

  it('refuses answers with wrong types', () => {
    expect(() => parseAnswer('{"request_id":"r","decision":"maybe"}')).toThrow(ProtocolError)
    expect(() => parseAnswer('{"request_id":1,"decision":"denied"}')).toThrow(ProtocolError)
    expect(() => parseAnswer('[]')).toThrow(ProtocolError)
  })

  it('checks base64url in relay bodies', () => {
    expect(parseSealedBox({ enc: 'ab-_', ct: 'cd' })).toEqual({ enc: 'ab-_', ct: 'cd' })
    expect(() => parseSealedBox({ enc: 'a b', ct: 'cd' })).toThrow(ProtocolError)
    expect(() => parseClaimed({ phone_id: 'p', sign: 's', kem: 'k', enc: 'e' })).toThrow(
      ProtocolError,
    )
  })

  it('reads phones from the module and from storage', () => {
    const fromModule = parsePhone({
      phone_id: 'p',
      phone_name: 'Test iPhone',
      sign: 's',
      kem: 'k',
      check: '418 902',
      scope: 'selected',
    })
    expect(fromModule.name).toBe('Test iPhone')
    expect(parsePhone({ ...fromModule }).name).toBe('Test iPhone')
    expect(() => parsePhone({ ...fromModule, scope: 'everything' })).toThrow(ProtocolError)
  })
})
