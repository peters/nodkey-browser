// @vitest-environment node
/** The relay client's address rule and its refusal to follow redirects (issue #12). */

import { beforeAll, describe, expect, it } from 'vitest'
import { generate, useKeyStore } from '../../src/background/keys'
import { Relay } from '../../src/background/relay'
import { loadWasm, memoryKeyStore } from './fake-chrome'

beforeAll(async () => {
  loadWasm()
  useKeyStore(memoryKeyStore())
  await generate()
})

describe('Relay', () => {
  it('takes plain http only for a relay on this computer', () => {
    expect(() => new Relay('http://relay.example.org', 'a')).toThrow('https://')
    expect(() => new Relay('http://192.168.1.10:8787', 'a')).toThrow('https://')
    expect(() => new Relay('https://relay.example.org/', 'a')).not.toThrow()
    expect(() => new Relay('http://127.0.0.1:41234', 'a')).not.toThrow()
  })

  it('never follows a redirect', async () => {
    const seen: RequestInit[] = []
    const fetcher = (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init) seen.push(init)
      // What fetch does with redirect: 'error' when the relay answers with a redirect.
      return Promise.reject(new TypeError('redirect'))
    }
    const r = new Relay('https://relay.example.org', 'a', fetcher)
    await expect(r.leave('p')).rejects.toMatchObject({ status: 0, code: 'unreachable' })
    expect(seen[0]?.redirect).toBe('error')
  })
})
