import { describe, expect, it } from 'vitest'
import { belongsTo, isLocalHost, mayFill, requestTarget, siteOf } from './site'

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

describe('requestTarget', () => {
  it('names the account when the page has a user name', () => {
    expect(requestTarget('github.com', 'alex@example.com')).toBe('github.com/alex@example.com')
    expect(requestTarget('github.com', '  alex ')).toBe('github.com/alex')
  })
  it('asks for the site when there is no usable user name', () => {
    expect(requestTarget('github.com')).toBe('github.com')
    expect(requestTarget('github.com', '')).toBe('github.com')
    expect(requestTarget('github.com', '   ')).toBe('github.com')
    expect(requestTarget('github.com', 'alex smith')).toBe('github.com')
    expect(requestTarget('github.com', 'a/b')).toBe('github.com')
    expect(requestTarget('github.com', 'x'.repeat(201))).toBe('github.com')
  })
})
