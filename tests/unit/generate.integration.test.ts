// @vitest-environment node
/**
 * "Make a strong password" (peters/nodkey#131) in the real background code against nodkey-cli's
 * fake relay and phone: the request with the user name and the page's rules, the fill of the new
 * password in the frame that asked, no save question afterwards, and the refusals. The pages are
 * a stand-in `chrome.tabs.sendMessage` that records what a frame would get. Invented data only.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useKeyStore } from '../../src/background/keys'
import type { Activity, ToContent } from '../../src/models/messages'
import { installFakeChrome, loadWasm, memoryKeyStore } from './fake-chrome'

const BIN = 'target/debug/nodkey-fake-relay'
let relay: ChildProcess | undefined
let base = ''
let session: Map<string, unknown>
let toPage: { frameId: number | undefined; msg: ToContent }[] = []
let fillReply = true

async function put(path: string, body: unknown): Promise<void> {
  const r = await fetch(base + path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
}

async function lastRequest(): Promise<Record<string, unknown> | undefined> {
  const seen = (await (await fetch(`${base}/_fake/seen`)).json()) as {
    request: Record<string, unknown>
  }[]
  return seen.at(-1)?.request
}

interface Made {
  site: string
  username: string
  password: string
  saved: string
  old_password?: string
}

async function made(): Promise<Made[]> {
  return ((await (await fetch(`${base}/_fake/generate`)).json()) as { made: Made[] }).made
}

const tabAt = (url: string, id = 7) => ({ id, windowId: 1, url }) as chrome.tabs.Tab

function activity(tabId = 7): Activity | undefined {
  return session.get(`activity:${tabId}`) as Activity | undefined
}

function newFills(): Extract<ToContent, { type: 'fill.new' }>[] {
  return toPage.flatMap(({ msg }) => (msg.type === 'fill.new' ? [msg] : []))
}

const RULES = {
  passwordrules:
    'minlength: 16; maxlength: 24; required: lower; required: upper; required: digit; allowed: [-_]',
  min_length: 12,
  max_length: 30,
}

const ask = (over: Partial<{ username: string; change: boolean; rules: object }> = {}) => ({
  type: 'generate' as const,
  title: 'Example Cloud',
  change: false,
  rules: RULES,
  ...over,
})

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
  session = installFakeChrome().session
  const fake = globalThis as unknown as { chrome: { tabs: Record<string, unknown> } }
  fake.chrome.tabs.sendMessage = (
    _tabId: number,
    msg: ToContent,
    options?: { frameId?: number },
  ) => {
    toPage.push({ frameId: options?.frameId, msg })
    return Promise.resolve(msg.type === 'fill.new' ? fillReply : undefined)
  }
  fake.chrome.tabs.captureVisibleTab = () => Promise.reject(new Error('no screen in a test'))
  loadWasm()
  useKeyStore(memoryKeyStore())
  const store = await import('../../src/background/store')
  await store.setSettings({ relay: base, screenshots: false })
  const agent = await import('../../src/background/agent')
  const { code } = await agent.startPairing('Test browser')
  const phone = await agent.finishPairing(code)
  if (!phone) throw new Error('no pairing')
  await agent.rememberPhone(phone)
})

afterAll(() => {
  relay?.kill()
})

beforeEach(async () => {
  toPage = []
  fillReply = true
  session.delete('generated:7')
  session.delete('username:7')
  session.delete('offer:7')
  await put('/_fake/mode', 'approve')
  await put('/_fake/passcode', true)
  await put('/_fake/generate', {})
})

describe('make a strong password', () => {
  it('asks with the user name and the rules, fills the frame that asked, and saves first', async () => {
    const { generate } = await import('../../src/background/generate')
    const page = tabAt('https://accounts.example.com/signup?flow=abc#step2')
    await generate(page, 3, page.url, ask({ username: 'new.alex@example.com' }))

    const request = await lastRequest()
    expect(request).toMatchObject({
      kind: 'generate',
      target: 'accounts.example.com',
      generate: {
        // No query and no fragment: they can hold tokens.
        url: 'https://accounts.example.com/signup',
        username: 'new.alex@example.com',
        title: 'Example Cloud',
        rules: RULES,
      },
    })
    expect((request?.generate as Record<string, unknown>).change).toBeUndefined()

    const saved = (await made()).at(-1)
    expect(saved).toMatchObject({ site: 'accounts.example.com', username: 'new.alex@example.com' })
    expect(saved?.password).toMatch(/^[A-Za-z0-9_-]{16,24}$/)
    expect(newFills()).toEqual([
      {
        type: 'fill.new',
        site: 'accounts.example.com',
        password: saved?.password,
        username: 'new.alex@example.com',
      },
    ])
    expect(toPage.find((p) => p.msg.type === 'fill.new')?.frameId).toBe(3)
    expect(activity()).toMatchObject({
      kind: 'generate',
      state: 'approved',
      message: 'Saved in Nodkey. The new password is filled in.',
    })
  })

  it('takes the user name of the step before, and asks no save question afterwards', async () => {
    const actions = await import('../../src/background/actions')
    const { generate } = await import('../../src/background/generate')
    const step1 = tabAt('https://accounts.example.com/signup/name')
    // The user name step of the sign-up: the name is kept for the next page.
    await actions.candidate(step1, step1.url ?? '', 'alex.two@example.com', '', undefined)
    const step2 = tabAt('https://accounts.example.com/signup/password')
    await generate(step2, 0, step2.url, ask())
    expect((await lastRequest())?.generate).toMatchObject({ username: 'alex.two@example.com' })

    // The person submits the sign-up with the filled password: no save question.
    const password = newFills().at(-1)?.password ?? ''
    await actions.candidate(step2, step2.url ?? '', '', password, 'Example Cloud')
    expect(await actions.takeOffer(step2, step2.url ?? '')).toBeNull()

    // Another site in the same tab still gets the question.
    const other = tabAt('https://shop.example.org/login')
    await actions.candidate(other, other.url ?? '', 'alex@example.org', 'Synthetic-typed-1', 'Shop')
    expect(await actions.takeOffer(other, other.url ?? '')).not.toBeNull()
  })

  it('a change replaces the password of the same login, and says that the old one is kept', async () => {
    const { generate } = await import('../../src/background/generate')
    const page = tabAt('https://www.example.net/account/password')
    await generate(page, 0, page.url, ask({ username: 'alex@example.net' }))
    await generate(page, 0, page.url, ask({ username: 'alex@example.net', change: true }))
    expect((await lastRequest())?.generate).toMatchObject({ change: true })
    const [first, second] = (await made()).filter((m) => m.username === 'alex@example.net')
    expect(second).toMatchObject({ saved: 'updated', old_password: first?.password })
    expect(newFills().at(-1)?.password).toBe(second?.password)
    expect(activity()?.message).toContain('Your iPhone keeps the old password for 30 days.')
  })

  it('uses the user name that the person typed on the phone', async () => {
    const { generate } = await import('../../src/background/generate')
    await put('/_fake/generate', { username: 'alex.phone@example.com' })
    const page = tabAt('https://accounts.example.com/signup')
    await generate(page, 0, page.url, ask())
    expect(newFills().at(-1)?.username).toBe('alex.phone@example.com')
  })

  it('fills nothing in a frame of another website, but says that the password is saved', async () => {
    const { generate } = await import('../../src/background/generate')
    const page = tabAt('https://accounts.example.com/signup')
    await generate(page, 5, 'https://widget.example.org/frame', ask())
    expect(newFills()).toEqual([])
    expect(activity()).toMatchObject({ state: 'approved' })
    expect(activity()?.message).toContain('found no field')
  })

  it('leaves out rules that break the limits of the protocol', async () => {
    const { generate, requestRules } = await import('../../src/background/generate')
    expect(
      requestRules({
        passwordrules: 'x'.repeat(301),
        min_length: -1,
        max_length: 2.5,
        pattern: 'a\u0007',
      }),
    ).toEqual({})
    const page = tabAt('https://accounts.example.com/signup')
    await generate(page, 0, page.url, ask({ rules: { passwordrules: 'x'.repeat(400) } }))
    expect((await lastRequest())?.generate).not.toHaveProperty('rules')
    expect(activity()?.state).toBe('approved')
  })
})

describe('refusals', () => {
  it('gives a calm text for each refusal and fills nothing', async () => {
    const { generate } = await import('../../src/background/generate')
    const page = tabAt('https://accounts.example.com/signup')
    const cases: [() => Promise<void>, string][] = [
      [() => put('/_fake/mode', 'deny'), 'No password was made. You said no on your iPhone.'],
      [
        () => put('/_fake/passcode', false),
        'Your iPhone has no passcode, so Nodkey cannot make a password here. You can set one in Settings → Face ID & Passcode.',
      ],
      [
        () => put('/_fake/generate', { codes_only: true }),
        'Nodkey on your iPhone lets this browser get codes only, so it makes no passwords here.',
      ],
      [
        () => put('/_fake/generate', { save_fails: true }),
        'Your iPhone could not save a new password, so it made none. Try again.',
      ],
    ]
    for (const [setUp, text] of cases) {
      await put('/_fake/mode', 'approve')
      await put('/_fake/passcode', true)
      await put('/_fake/generate', {})
      await setUp()
      await generate(page, 0, page.url, ask())
      expect(activity()?.message).toBe(text)
    }
    expect(newFills()).toEqual([])
    expect(session.get('generated:7')).toBeUndefined()
  })

  it('rules that no password can meet', async () => {
    const { generate } = await import('../../src/background/generate')
    const page = tabAt('https://accounts.example.com/signup')
    await generate(page, 0, page.url, ask({ rules: { min_length: 40, max_length: 8 } }))
    expect(activity()).toMatchObject({
      state: 'error',
      message:
        'Nodkey cannot make a password that fits the rules of this page. Type one yourself, and Nodkey offers to save it.',
    })
    expect(newFills()).toEqual([])
  })
})
