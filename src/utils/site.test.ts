import { describe, expect, it } from 'vitest'
import { belongsTo, isLocalHost, mayFill, siteOf } from './site'

describe('siteOf', () => {
  it('names the site without www', () => {
    expect(siteOf('https://www.vg.no/login?next=/')).toBe('vg.no')
    expect(siteOf('https://github.com/login')).toBe('github.com')
    expect(siteOf('https://Accounts.Example.COM./x')).toBe('accounts.example.com')
    expect(siteOf('http://192.168.1.1/')).toBe('192.168.1.1')
  })
  it('refuses other schemes and junk', () => {
    expect(siteOf('chrome://extensions')).toBeNull()
    expect(siteOf('about:blank')).toBeNull()
    expect(siteOf('not a url')).toBeNull()
  })
})

describe('mayFill', () => {
  it('allows HTTPS and local HTTP only', () => {
    expect(mayFill('https://vg.no/')).toBe(true)
    expect(mayFill('http://192.168.1.1/')).toBe(true)
    expect(mayFill('http://printer.local/')).toBe(true)
    expect(mayFill('http://localhost:8080/')).toBe(true)
    expect(mayFill('http://[fe80::1]/')).toBe(true)
    expect(mayFill('http://vg.no/')).toBe(false)
    expect(mayFill('file:///etc/passwd')).toBe(false)
  })
  it('knows local hosts', () => {
    expect(isLocalHost('10.0.0.138')).toBe(true)
    expect(isLocalHost('example.com')).toBe(false)
  })
})

describe('belongsTo', () => {
  it('accepts the site and its subdomains', () => {
    expect(belongsTo('https://login.vg.no/', 'vg.no')).toBe(true)
    expect(belongsTo('https://www.vg.no/', 'vg.no')).toBe(true)
    expect(belongsTo('https://vg.no.evil.example/', 'vg.no')).toBe(false)
    expect(belongsTo('https://evilvg.no/', 'vg.no')).toBe(false)
  })
})
