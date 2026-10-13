import { describe, expect, it } from 'vitest'
import { PasskeyError } from '../models/passkey'
import { checkFrame, rpIdFor, secureHost, senderOrigin } from './origin'

function refused(f: () => void): string {
  try {
    f()
  } catch (e) {
    if (e instanceof PasskeyError) return e.domName
    throw e
  }
  return 'allowed'
}

describe('passkey origins', () => {
  it('takes the origin from the browser sender', () => {
    expect(senderOrigin({ origin: 'https://login.example.com' })).toBe('https://login.example.com')
    expect(senderOrigin({ url: 'https://example.com:8443/a?b#c' })).toBe('https://example.com:8443')
    expect(senderOrigin({ origin: 'null', url: 'https://example.com/' })).toBeNull()
    expect(senderOrigin({ url: 'about:blank' })).toBeNull()
    expect(senderOrigin({})).toBeNull()
  })

  it('allows HTTPS and http://localhost only', () => {
    expect(secureHost('https://Example.com')).toBe('example.com')
    expect(secureHost('http://localhost:5173')).toBe('localhost')
    expect(refused(() => secureHost('http://example.com'))).toBe('SecurityError')
    expect(refused(() => secureHost('http://127.0.0.1:8080'))).toBe('SecurityError')
    expect(refused(() => secureHost('https://192.168.1.1'))).toBe('SecurityError')
    expect(refused(() => secureHost('https://[::1]'))).toBe('SecurityError')
    expect(refused(() => secureHost('ftp://example.com'))).toBe('SecurityError')
  })

  it('takes the host or a parent domain as the relying party', () => {
    expect(rpIdFor('login.example.com', undefined)).toBe('login.example.com')
    expect(rpIdFor('login.example.com', 'example.com')).toBe('example.com')
    expect(rpIdFor('login.example.com', 'Example.COM')).toBe('example.com')
    expect(rpIdFor('localhost', undefined)).toBe('localhost')
    expect(refused(() => rpIdFor('example.com', 'login.example.com'))).toBe('SecurityError')
    expect(refused(() => rpIdFor('example.com', 'other.com'))).toBe('SecurityError')
    expect(refused(() => rpIdFor('badexample.com', 'example.com'))).toBe('SecurityError')
    expect(refused(() => rpIdFor('example.com', 'com'))).toBe('SecurityError')
    expect(refused(() => rpIdFor('a.example.com', '.example.com'))).toBe('SecurityError')
    expect(refused(() => rpIdFor('example.com', 'example.com.'))).toBe('SecurityError')
  })

  it('refuses cross-origin frames', () => {
    const top = 'https://example.com/page'
    const frame = (...args: Parameters<typeof checkFrame>) =>
      refused(() => {
        checkFrame(...args)
      })
    expect(frame(0, 'https://example.com', top, false)).toBe('allowed')
    expect(frame(3, 'https://example.com', top, true)).toBe('allowed')
    expect(frame(3, 'https://example.com', top, false)).toBe('SecurityError')
    expect(frame(3, 'https://evil.test', top, true)).toBe('SecurityError')
    expect(frame(3, 'https://example.com', undefined, true)).toBe('SecurityError')
    expect(frame(undefined, 'https://example.com', top, true)).toBe('SecurityError')
  })
})
