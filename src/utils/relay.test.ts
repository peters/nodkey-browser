import { describe, expect, it } from 'vitest'
import { relayAddressOk } from './relay'

describe('relayAddressOk', () => {
  it('takes https, and plain http only on this computer', () => {
    for (const ok of [
      'https://relay.nodkey.app',
      'https://relay.example.org:8443/',
      'http://127.0.0.1:41234',
      'http://localhost:8787',
      'http://[::1]:9000',
    ]) {
      expect(relayAddressOk(ok), ok).toBe(true)
    }
    for (const bad of [
      'http://relay.nodkey.app',
      'http://192.168.1.10:8787',
      'http://127.0.0.1.example.org',
      'http://localhost.example.org',
      'ftp://relay.nodkey.app',
      'https://user:pw@relay.nodkey.app',
      'https://relay.nodkey.app/?x=1',
      'relay.nodkey.app',
      '',
    ]) {
      expect(relayAddressOk(bad), bad).toBe(false)
    }
  })
})
