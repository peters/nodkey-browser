import { describe, expect, it } from 'vitest'
import { PasskeyError, parsePasskeyCall } from './passkey'

const CHALLENGE = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

describe('passkey calls from the page', () => {
  it('reads a get call', () => {
    expect(
      parsePasskeyCall({
        op: 'get',
        challenge: CHALLENGE,
        rpId: 'example.com',
        allowCredentials: ['AQID'],
        userVerification: 'required',
      }),
    ).toEqual({
      op: 'get',
      challenge: CHALLENGE,
      rpId: 'example.com',
      allowCredentials: ['AQID'],
      userVerification: 'required',
    })
  })

  it('reads a create call and ignores unknown enum values', () => {
    const call = parsePasskeyCall({
      op: 'create',
      challenge: CHALLENGE,
      rp: { name: 'Example' },
      user: { id: 'dXNlci0x', name: 'alex', displayName: 'Alex' },
      algorithms: [-8, -7, -257],
      residentKey: 'sometimes',
      userVerification: 'discouraged',
    })
    expect(call).toEqual({
      op: 'create',
      challenge: CHALLENGE,
      rp: { name: 'Example' },
      user: { id: 'dXNlci0x', name: 'alex', displayName: 'Alex' },
      algorithms: [-8, -7, -257],
      excludeCredentials: [],
      residentKey: 'discouraged',
      userVerification: 'discouraged',
    })
  })

  it('refuses malformed calls', () => {
    const bad = [
      null,
      { op: 'get', challenge: 'short' },
      { op: 'get', challenge: `${CHALLENGE}!` },
      { op: 'get', challenge: CHALLENGE, allowCredentials: 'AQID' },
      { op: 'get', challenge: CHALLENGE, allowCredentials: Array(65).fill('AQID') },
      { op: 'get', challenge: CHALLENGE, rpId: 7 },
      { op: 'create', challenge: CHALLENGE, rp: { name: 'x' }, user: {}, algorithms: [-7] },
      {
        op: 'create',
        challenge: CHALLENGE,
        rp: { name: 'x' },
        user: { id: 'A'.repeat(90), name: 'a', displayName: 'a' },
        algorithms: [-7],
      },
      {
        op: 'create',
        challenge: CHALLENGE,
        rp: { name: 'x' },
        user: { id: 'AQID', name: 'a' },
        algorithms: [],
      },
      {
        op: 'create',
        challenge: CHALLENGE,
        rp: { name: 'x' },
        user: { id: 'AQID', name: ' ', displayName: '' },
        algorithms: [-7],
      },
      { op: 'delete', challenge: CHALLENGE },
    ]
    for (const v of bad) {
      expect(() => parsePasskeyCall(v), JSON.stringify(v)).toThrow(PasskeyError)
    }
  })
})
