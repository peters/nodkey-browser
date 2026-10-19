/** The bridge sends a passkey call to the background only after a click or a key press. */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PAGE_REPLY, PAGE_REQUEST, type PasskeyReply } from '../models/passkey'

const posted: unknown[] = []
let active = false

beforeAll(async () => {
  Object.defineProperty(navigator, 'userActivation', {
    configurable: true,
    get: () => ({ isActive: active, hasBeenActive: active }),
  })
  vi.stubGlobal('chrome', {
    runtime: {
      connect: () => ({
        postMessage: (m: unknown) => posted.push(m),
        onMessage: { addListener: () => undefined },
        onDisconnect: { addListener: () => undefined },
        disconnect: () => undefined,
      }),
    },
  })
  await import('./bridge')
})

function request(id: string): PasskeyReply | null {
  let got: PasskeyReply | null = null
  const onReply = (e: Event) => {
    const msg = JSON.parse(String((e as CustomEvent<unknown>).detail)) as {
      id: string
      reply: PasskeyReply
    }
    if (msg.id === id) got = msg.reply
  }
  window.addEventListener(PAGE_REPLY, onReply)
  const call = { op: 'create' }
  window.dispatchEvent(new CustomEvent(PAGE_REQUEST, { detail: JSON.stringify({ id, call }) }))
  window.removeEventListener(PAGE_REPLY, onReply)
  return got
}

describe('the passkey bridge', () => {
  it('refuses a call without a click or a key press, before the background', () => {
    active = false
    expect(request('a')).toMatchObject({ ok: false, name: 'NotAllowedError' })
    expect(posted).toEqual([])
  })

  it('sends a call right after a click', () => {
    active = true
    expect(request('b')).toBeNull()
    expect(posted).toEqual([{ call: { op: 'create' }, sameOriginAncestors: true }])
  })
})
