import { describe, expect, it } from 'vitest'
import {
  ProtocolError,
  parseAnswer,
  parseClaimed,
  parsePhone,
  parseSealedBox,
  parseSealedRequest,
} from './protocol'

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

  it('reads sign-in methods, the second step, the agent limit and PRF outputs', () => {
    const a = parseAnswer(
      JSON.stringify({
        v: 1,
        request_id: 'r',
        decision: 'approved',
        lease: { kind: 'once' },
        error: 'quota_warning',
        quota: { new_today: 12, limit: 10, burst: true },
        method: { kind: 'federated', provider: 'google', certainty: 'confirmed' },
        via: {
          account: { issuer: 'Google', name: 'alex@example.com', site: 'accounts.google.com' },
          username: 'alex@example.com',
          password: 'pw',
          code: '190274',
          seconds_left: 21,
        },
        second_step: { prefer: ['passkey', 'totp', 'fax'], avoid: ['sms'] },
        passkey: {
          credential_id: 'AQID',
          authenticator_data: 'AAAA',
          prf: { enabled: true, results: { first: 'BBBB' } },
        },
      }),
    )
    expect(a.lease).toEqual({ kind: 'once' })
    expect(a.quota).toEqual({ new_today: 12, limit: 10, burst: true })
    expect(a.method).toEqual({ kind: 'federated', provider: 'google', certainty: 'confirmed' })
    expect(a.via?.account.site).toBe('accounts.google.com')
    expect(a.via?.code).toBe('190274')
    expect(a.second_step).toEqual({ prefer: ['passkey', 'totp'], avoid: ['sms'] })
    expect(a.passkey?.prf).toEqual({ enabled: true, results: { first: 'BBBB' } })
    expect(parseAnswer('{"v":1,"request_id":"r","decision":"queued"}').decision).toBe('queued')
    expect(
      parseAnswer('{"v":1,"request_id":"r","decision":"rejected","error":"rate_limited"}').error,
    ).toBe('rate_limited')
  })

  it('keeps the relay ttl of an sms_code request', () => {
    const sealed = parseSealedRequest(
      JSON.stringify({
        request_id: 'r',
        envelope: { request_id: 'r', enc: 'e', ct: 'c', ttl: 180 },
      }),
    )
    expect(sealed.envelope.ttl).toBe(180)
  })
})
