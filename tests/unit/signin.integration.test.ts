// @vitest-environment node
/**
 * Sign-in methods, SMS codes and the agent limit in the real background code against
 * nodkey-cli's fake relay and phone. The fake phone signs in to renderfarm.example only with
 * Google and sends its invented Google login as `via`. The pages are a stand-in
 * `chrome.tabs.sendMessage` that records what a frame would get. Invented data only.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useKeyStore } from '../../src/background/keys'
import type { Activity, ToContent } from '../../src/models/messages'
import { installFakeChrome, loadWasm, memoryKeyStore } from './fake-chrome'

const BIN = 'target/debug/nodkey-fake-relay'
const GOOGLE_USER = 'alex.example@gmail.example'
const PASSWORD = 'correct horse battery staple'
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

const tabAt = (url: string, id = 7) => ({ id, windowId: 1, url }) as chrome.tabs.Tab

function activity(tabId = 7): Activity | undefined {
  return session.get(`activity:${tabId}`) as Activity | undefined
}

function fills(): Extract<ToContent, { type: 'fill' }>[] {
  return toPage.flatMap(({ msg }) => (msg.type === 'fill' ? [msg] : []))
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
  session = installFakeChrome().session
  const fake = globalThis as unknown as { chrome: { tabs: Record<string, unknown> } }
  fake.chrome.tabs.sendMessage = (
    _tabId: number,
    msg: ToContent,
    options?: { frameId?: number },
  ) => {
    toPage.push({ frameId: options?.frameId, msg })
    return Promise.resolve(msg.type === 'fill' ? fillReply : undefined)
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
  await put('/_fake/mode', 'approve')
  await put('/_fake/quota', { state: 'off' })
  await put('/_fake/account', null)
})

describe('the answered account against the page', () => {
  it('fills only on the account website, unless the person picked it for this site', async () => {
    const actions = await import('../../src/background/actions')
    const page = tabAt('https://login.example.com/signin')
    // The phone answers with an account saved for this website: filled.
    await actions.fill('login', page, 0, undefined, page.url)
    expect(fills().at(-1)).toMatchObject({ site: 'login.example.com', password: PASSWORD })

    // An account saved for another website (a fault on the phone side): nothing is filled.
    toPage = []
    await put('/_fake/account', { site: 'example.org', match: 'direct' })
    await actions.fill('login', page, 0, undefined, page.url)
    await actions.fill('code', page, 0, undefined, page.url)
    expect(fills()).toEqual([])
    expect(activity()?.state).toBe('error')
    expect(activity()?.message).toBe(
      'Not filled: Nodkey saved this account for example.org, not for login.example.com.',
    )

    // No website at all, and the person did not pick it for this site: nothing either.
    await put('/_fake/account', { match: 'direct' })
    await actions.fill('code', page, 0, undefined, page.url)
    expect(fills()).toEqual([])
    expect(activity()?.message).toBe(
      'Not filled: this account has no website in Nodkey that matches login.example.com.',
    )

    // An extra website of the account, or picked by hand for this site on the phone: filled.
    await put('/_fake/account', { site: 'example.org', sites: ['example.com'], match: 'alias' })
    await actions.fill('code', page, 0, undefined, page.url)
    expect(fills().at(-1)).toEqual({ type: 'fill', site: 'login.example.com', code: '190274' })
    await put('/_fake/account', { site: 'example.org', match: 'chosen' })
    await actions.fill('login', page, 0, undefined, page.url)
    expect(fills().at(-1)).toMatchObject({ site: 'login.example.com', password: PASSWORD })
  })
})

describe('sign-in methods against the fake phone', () => {
  it('shows the Google method and fills the Google login only on Google', async () => {
    const actions = await import('../../src/background/actions')
    const signin = await import('../../src/background/signin')
    const site = tabAt('https://renderfarm.example/login')
    await actions.fill('login', site, 0, undefined, site.url)
    // No password for the site itself: the page gets the method, not a fill.
    expect(fills()).toEqual([])
    const method = toPage.find(({ msg }) => msg.type === 'method')?.msg
    expect(method).toMatchObject({ type: 'method', provider: 'google', label: 'Google' })
    expect(activity()?.message).toContain('You sign in to renderfarm.example with Google.')

    // Never on the site itself, nor on a host that only looks like Google's.
    expect(await signin.fillFromVia(7, 0, 'https://renderfarm.example/login', 'login')).toBe(false)
    expect(
      await signin.fillFromVia(7, 0, 'https://accounts.google.com.evil.example/', 'login'),
    ).toBe(false)
    expect(fills()).toEqual([])

    // On Google's own page, after "Sign in with Google": the hint once, then the fill.
    const google = tabAt('https://accounts.google.com/signin')
    expect((await signin.page(google, google.url ?? '')).via).toEqual({
      site: 'renderfarm.example',
      label: 'Google',
      username: GOOGLE_USER,
    })
    expect((await signin.page(google, google.url ?? '')).via).toBeNull()
    const before = await lastRequest()
    await actions.fill('login', google, 0, undefined, google.url)
    expect(fills().at(-1)).toEqual({
      type: 'fill',
      site: 'accounts.google.com',
      username: GOOGLE_USER,
      password: PASSWORD,
    })
    expect(activity()?.message).toBe('Filled your Google login.')
    // The second step: Nodkey has a code for the Google login, so it chooses the code.
    expect(await signin.stepAvailable(7, google.url ?? '')).toBe(true)
    expect(await signin.stepPick(7, google.url ?? '', ['app_prompt', 'totp', 'sms'])).toBe('totp')
    await actions.fill('code', google, 0, undefined, google.url)
    expect(fills().at(-1)).toEqual({ type: 'fill', site: 'accounts.google.com', code: '190274' })
    // All of it without a new request to the phone.
    expect(await lastRequest()).toEqual(before)
  })

  it('chooses the second step by the order in the answer', async () => {
    const actions = await import('../../src/background/actions')
    const signin = await import('../../src/background/signin')
    const vg = tabAt('https://www.vg.no/login', 8)
    expect(await signin.stepAvailable(8, vg.url ?? '')).toBe(false)
    await actions.fill('login', vg, 0, undefined, vg.url)
    expect(fills().at(-1)?.password).toBe(PASSWORD)
    expect(await signin.stepAvailable(8, vg.url ?? '')).toBe(true)
    expect(await signin.stepPick(8, vg.url ?? '', ['sms', 'passkey', 'totp'])).toBe('passkey')
    expect(await signin.stepPick(8, vg.url ?? '', ['app_prompt', 'sms'])).toBeNull()
  })

  it('asks to remember a sign-in with a provider and sends only the site and provider', async () => {
    const signin = await import('../../src/background/signin')
    const site = tabAt('https://tools.example.com/login', 9)
    await signin.providerClicked(site, 'google')
    // Back on the site before Google: nothing to ask.
    expect((await signin.page(site, 'https://tools.example.com/home')).offer).toBeNull()
    await signin.page(
      tabAt('https://accounts.google.com/o/oauth2', 10),
      'https://accounts.google.com/o/oauth2',
    )
    const home = tabAt('https://tools.example.com/home', 9)
    const offer = (await signin.page(home, home.url ?? '')).offer
    expect(offer).toEqual({ site: 'tools.example.com', provider: 'google', label: 'Google' })
    expect((await signin.page(home, home.url ?? '')).offer).toBeNull()

    await signin.suggest(home, 'tools.example.com', 'google')
    expect(activity(9)?.message).toBe(
      'Your iPhone has the suggestion. Accept it in the Nodkey app.',
    )
    const queued = (await (await fetch(`${base}/_fake/suggestions`)).json()) as {
      target: string
      suggest: unknown
    }[]
    expect(queued.at(-1)?.target).toBe('tools.example.com')
    expect(queued.at(-1)?.suggest).toEqual({
      method: { kind: 'federated', provider: 'google', certainty: 'seen', source: 'extension' },
      outcome: 'signed_in',
    })
    expect(JSON.stringify(await lastRequest())).not.toContain('password')

    // "Never for this site" holds for the next sign-in too.
    await signin.dismiss('tools.example.com', true)
    await signin.providerClicked(site, 'google')
    await signin.page(tabAt('https://accounts.google.com/', 10), 'https://accounts.google.com/')
    expect((await signin.page(home, home.url ?? '')).offer).toBeNull()

    // No question for a site the phone knows signs in with Google.
    const farm = tabAt('https://renderfarm.example/', 11)
    await signin.providerClicked(farm, 'google')
    await signin.page(tabAt('https://accounts.google.com/', 10), 'https://accounts.google.com/')
    expect((await signin.page(farm, farm.url ?? '')).offer).toBeNull()
  })

  it('shows calmly when the phone takes no more suggestions', async () => {
    const signin = await import('../../src/background/signin')
    const site = tabAt('https://notes.example.org/', 12)
    // Five per hour per agent; the first test sent one already.
    for (let i = 0; i < 5; i++) await signin.suggest(site, 'notes.example.org', 'github')
    expect(activity(12)?.state).toBe('denied')
    expect(activity(12)?.message).toBe(
      'Your iPhone did not take the suggestion now. You can try again later.',
    )
  })
})

describe('SMS codes against the fake phone', () => {
  it('fills the code from the SMS, and says what to check when none came', async () => {
    const actions = await import('../../src/background/actions')
    const page = tabAt('https://account.example.com/verify', 13)
    const asked = actions.fill('sms', page, 0, undefined, page.url)
    await new Promise((r) => setTimeout(r, 500))
    expect(activity(13)?.message).toBe(
      'Waiting for the SMS. When it arrives, approve on your iPhone.',
    )
    await put('/_fake/sms', { text: 'Your code is 482913. Do not share it.' })
    await asked
    expect(fills().at(-1)).toEqual({ type: 'fill', site: 'account.example.com', code: '482913' })
    expect(await lastRequest()).toMatchObject({
      kind: 'sms_code',
      target: 'account.example.com',
      wait_seconds: 120,
    })

    const again = actions.fill('sms', page, 0, undefined, page.url)
    await new Promise((r) => setTimeout(r, 500))
    await put('/_fake/sms', { expire: true })
    await again
    expect(activity(13)?.state).toBe('expired')
    expect(activity(13)?.message).toContain('Shortcuts automation')
  })
})

describe('the agent limit against the fake phone', () => {
  it('fills with a calm note, and says how to resume a pause', async () => {
    const actions = await import('../../src/background/actions')
    const vg = tabAt('https://vg.no/login', 14)
    await put('/_fake/quota', { state: 'warning', new_today: 12, limit: 10 })
    await actions.fill('login', vg, 0, undefined, vg.url)
    expect(fills().at(-1)?.password).toBe(PASSWORD)
    expect(activity(14)?.state).toBe('approved')
    expect(activity(14)?.note).toBe(
      'This browser got 12 new logins and codes today, so your iPhone asks with a notice. Approve each request in the Nodkey app.',
    )

    await put('/_fake/quota', { state: 'paused', new_today: 26, limit: 10 })
    await actions.fill('code', vg, 0, undefined, vg.url)
    expect(activity(14)?.state).toBe('denied')
    expect(activity(14)?.message).toContain('because it got many new logins and codes today')
    expect(activity(14)?.message).toContain('Resume it under Agents in Nodkey.')

    await put('/_fake/quota', { state: 'paused_by_user' })
    await actions.fill('code', vg, 0, undefined, vg.url)
    expect(activity(14)?.message).toBe(
      'Nodkey on your iPhone paused this browser. Resume it under Agents in Nodkey.',
    )
  })
})
