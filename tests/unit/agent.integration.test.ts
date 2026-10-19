// @vitest-environment node
/**
 * The real background code (pairing, requests, saves) against nodkey-cli's fake relay, which also
 * plays the phone. Keys are real WebCrypto keys, as in the browser.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seal_password } from '../../src/wasm/nodkey.js'
import { useKeyStore } from '../../src/background/keys'
import { installFakeChrome, loadWasm, memoryKeyStore } from './fake-chrome'

const BIN = 'target/debug/nodkey-fake-relay'
let relay: ChildProcess | undefined
let base = ''

async function control(path: string, init?: RequestInit): Promise<Response> {
  return fetch(base + path, init)
}

async function put(path: string, body: unknown): Promise<void> {
  await control(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  if (!existsSync(BIN)) throw new Error(`${BIN} is missing: run cargo build -p fake-relay`)
  const child = spawn(BIN, ['127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  relay = child
  base = await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      const m = /listening on (\S+)/.exec(chunk.toString())
      if (m?.[1]) resolve(m[1])
    })
    child.on('exit', () => {
      reject(new Error('fake relay exited'))
    })
  })
  installFakeChrome()
  loadWasm()
  useKeyStore(memoryKeyStore())
  const store = await import('../../src/background/store')
  await store.setSettings({ relay: base })
})

afterAll(() => {
  relay?.kill()
})

describe('the background against the fake phone', () => {
  it('pairs, asks, gets denied, and saves', { timeout: 60_000 }, async () => {
    const agent = await import('../../src/background/agent')
    const store = await import('../../src/background/store')

    // Pairing: the code, the phone's grant with its commitment, the pairing check with this
    // browser's nonce, and a check number both sides agree on. Nothing is kept before the
    // person confirms it.
    const { code } = await agent.startPairing('Test browser')
    expect(code).toMatch(/^[0-9A-Z]{6}$/)
    const phone = await agent.finishPairing(code)
    expect(phone?.name).toBe('Test iPhone')
    if (!phone) return
    expect(phone.signs).toBe(true)
    expect(phone.check).toMatch(/^\d{3} \d{3}$/)
    expect(await store.phones()).toEqual([])
    await agent.rememberPhone(phone)
    const me = await store.agent()
    const check = (await (await control(`/_fake/check/${me?.agent_id ?? ''}`)).json()) as {
      check: string
    }
    expect(phone.check).toBe(check.check)

    const client = { app: 'Nodkey test', app_version: '0', os: 'Linux' }
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      ),
      (c) => c.charCodeAt(0),
    )

    // A login, with a picture of the page.
    const login = await agent.ask(
      {
        kind: 'login',
        site: 'vg.no',
        reason: 'Sign in to vg.no in a test',
        picture: { type: 'image/png', bytes: png, caption: 'vg.no' },
        client,
      },
      phone,
    )
    expect(login.answer?.decision).toBe('approved')
    expect(login.answer?.password).toBe('correct horse battery staple')

    // A code.
    const code2 = await agent.ask(
      { kind: 'code', site: 'github.com', reason: 'Code', client },
      phone,
    )
    expect(code2.answer?.code).toBe('190274')

    // Denied.
    await control('/_fake/mode', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '"deny"',
    })
    const denied = await agent.ask(
      { kind: 'code', site: 'github.com', reason: 'No', client },
      phone,
    )
    expect(denied.answer?.decision).toBe('denied')
    await control('/_fake/mode', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '"approve"',
    })

    // A save, with the password sealed to the phone on its own.
    const password = JSON.parse(seal_password(me?.agent_id ?? '', phone.kem, 'n3w-passw0rd')) as {
      enc: string
      ct: string
    }
    const saved = await agent.ask(
      {
        kind: 'save',
        site: 'vg.no',
        reason: 'Save the login',
        save: { url: 'https://vg.no/login', username: 'alex@example.com', password },
        client,
      },
      phone,
    )
    expect(saved.answer?.saved).toBe('added')

    // What the phone saw.
    const seen = (await (await control('/_fake/seen')).json()) as {
      request: {
        kind: string
        agent: string
        save?: { username: string }
        attachment?: { sha256?: string }
      }
      attachment: number[] | null
      saved_password: string | null
      signed: boolean
    }[]
    expect(seen.map((s) => s.request.kind)).toEqual(['login', 'code', 'code', 'save'])
    // Every request carries this browser's signature, and the picture its hash.
    expect(seen.every((s) => s.signed)).toBe(true)
    expect(seen[0]?.request.attachment?.sha256).toMatch(/^[\w-]{43}$/)
    expect(seen[0]?.attachment?.length).toBe(png.length)
    expect(seen[3]?.request.save?.username).toBe('alex@example.com')
    // The phone can open the password that was sealed to it on its own.
    expect(seen[3]?.saved_password).toBe('n3w-passw0rd')
    expect(seen[0]?.request.agent).toBe('Test browser')

    // Unpair: the relay forgets the pairing and the phone is gone here.
    await agent.unpair(phone.phone_id)
    expect(await store.phones()).toEqual([])
  })

  it(
    'refuses an old app and a check that does not fit, and leaves',
    { timeout: 60_000 },
    async () => {
      const agent = await import('../../src/background/agent')
      const store = await import('../../src/background/store')
      // An app made before the commitment: never paired by its old number.
      await put('/_fake/pairing', { old_app: true })
      const old = await agent.startPairing('Test browser')
      await expect(agent.finishPairing(old.code)).rejects.toMatchObject({ code: 'old_app' })

      // A nonce that does not fit the commitment.
      await put('/_fake/pairing', { bad_nonce: true })
      const bad = await agent.startPairing('Test browser')
      await expect(agent.finishPairing(bad.code)).rejects.toMatchObject({ code: 'check' })
      expect(await store.phones()).toEqual([])
      await put('/_fake/pairing', {})
    },
  )

  it('refuses an unsigned answer from a phone that signs', { timeout: 60_000 }, async () => {
    const agent = await import('../../src/background/agent')
    const store = await import('../../src/background/store')
    const { code } = await agent.startPairing('Test browser')
    const phone = await agent.finishPairing(code)
    if (!phone) throw new Error('not paired')
    await agent.rememberPhone(phone)
    const client = { app: 'Nodkey test', app_version: '0', os: 'Linux' }
    const ask = (p: typeof phone) =>
      agent.ask({ kind: 'code', site: 'github.com', reason: 'Code', client }, p)

    await put('/_fake/pairing', { unsigned_answers: true })
    await expect(ask(phone)).rejects.toMatchObject({ name: 'NotSignedError' })
    // A pairing made before signatures takes an unsigned answer, until its phone signs once.
    const before = { ...phone, signs: false }
    await store.setPhones([before])
    expect((await ask(before)).answer?.code).toBe('190274')
    await put('/_fake/pairing', {})
    const signed = await ask(before)
    expect(signed.phone.signs).toBe(true)
    expect((await store.phones())[0]?.signs).toBe(true)
    await agent.unpair(phone.phone_id)
  })
})
