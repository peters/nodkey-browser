// Runs the extension in real Chromium and Firefox on an isolated desktop, against nodkey-cli's
// fake relay and phone and a synthetic test site: pair, fill a login, fill a code (one field and a
// row of boxes), save a new login, make a strong password, and create and use a passkey that the
// site's server checks.
// See docs/features/browser-e2e.md.
//
//   node tests/e2e/run.mjs [--browser chromium|firefox|both] [--keep] [--display :N]
//                          [--passkeys-only | --cards-only | --signin-only | --generate-only]
//
// Without --display it starts its own Xvfb + x11vnc (set NODKEY_E2E_TOOLS to an unpacked tools
// root when x11vnc is not installed) and prints the VNC address for a Horizon Device panel.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { cardFrameFlow } from './cardframes.mjs'
import { cardFlow } from './cards.mjs'
import { coveredFlow } from './covered.mjs'
import { findVnc, startDesktop } from './desktop.mjs'
import { generateFlow } from './generate.mjs'
import { PAY_HOST, startPayFrames } from './payframe.mjs'
import { startGoogle } from './provider.mjs'
import { startRelayProxy } from './relayproxy.mjs'
import { signinFlow } from './signin.mjs'
import { startSite } from './site.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const which = option('--browser', 'both')
const keep = args.includes('--keep')
const passkeysOnly = args.includes('--passkeys-only')
const cardsOnly = args.includes('--cards-only')
const signinOnly = args.includes('--signin-only')
const generateOnly = args.includes('--generate-only')
const only = passkeysOnly || cardsOnly || signinOnly || generateOnly
const root = resolve(import.meta.dirname, '../..')
const run = `run-${Date.now()}`
// Snap Chromium can only read under ~/snap/chromium; Firefox and logs use a private cache folder.
const chromiumHome = join(homedir(), 'snap/chromium/common/nodkey-e2e', run)
const state = join(homedir(), '.cache/nodkey-e2e', run)
const FIREFOX_UUID = '6f3b8c1e-0d4a-4f8e-9c2b-1a7e5d9f0b42'

let cleanup = () => {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m)

async function waitFor(what, check, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const v = await check()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(250)
  }
}

async function startRelay() {
  const bin = join(root, 'target/debug/nodkey-fake-relay')
  if (!existsSync(bin)) throw new Error('run: cargo build -p fake-relay')
  const child = spawn(bin, ['127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const base = await new Promise((ok, fail) => {
    child.stdout.on('data', (b) => {
      const m = /listening on (\S+)/.exec(String(b))
      if (m) ok(m[1])
    })
    child.on('exit', () => fail(new Error('fake relay exited')))
  })
  const control = async (path, init) => fetch(base + path, init)
  return { base, child, control }
}

/** Opens an extension page and returns it with helpers that run in the extension. */
async function extensionPage(browser, url) {
  const page = await browser.newPage()
  await page.goto(url)
  return page
}

/**
 * Clicks the Nodkey button of `selector`'s field (it sits in a closed shadow root): inside the
 * field's right edge, or right of `anchor` (the last of a row of code boxes).
 */
async function clickKey(page, selector, anchor = selector) {
  await page.click(selector)
  // The button takes a click only after it was in place for a moment (issue #9).
  await sleep(600)
  const r = await page.$eval(anchor, (el) => {
    const b = el.getBoundingClientRect()
    return { right: b.right, top: b.top, width: b.width, height: b.height }
  })
  const inside = r.width >= 60
  const size = inside ? Math.min(28, Math.max(20, r.height - 8)) : 28
  const x = inside ? r.right - size / 2 - 6 : r.right + 8 + size / 2
  await page.mouse.click(x, r.top + r.height / 2)
}

/** Pairs through the popup page (Chromium lets the driver open extension pages). */
async function pairByDriver(name, browser, base, relay) {
  log(name, 'pairing')
  const popup = await extensionPage(browser, `${base}/popup.html`)
  await popup.bringToFront()
  await popup.waitForSelector('[data-testid=pair-start]')
  await popup.$eval('main input', (el) => el.select())
  await popup.type('main input', `${name} test`)
  await popup.click('[data-testid=pair-start]')
  await popup.waitForSelector('[data-testid=check-number]', { timeout: 60_000 })
  const shown = await popup.$eval('[data-testid=check-number]', (el) => el.textContent?.trim())
  const agentId = await popup.evaluate(async () => {
    const v = await chrome.storage.local.get('agent')
    return v.agent.agent_id
  })
  const phoneCheck = (await (await relay.control(`/_fake/check/${agentId}`)).json()).check
  if (shown !== phoneCheck) throw new Error(`check numbers differ: ${shown} vs ${phoneCheck}`)
  log(name, `check number ${shown} matches the phone`)
  await sleep(1500)
  await popup.click('[data-testid=pair-confirm]')
  await popup.waitForSelector('[data-testid=pair-start]', { hidden: true })
  await popup.close()
  return `${name} test`
}

/**
 * Firefox does not let the driver open extension pages, so the pairing is done with real input on
 * the isolated desktop (docs/features/pairing-firefox.md). The run waits for a marker file.
 */
async function pairByHand(name, relay) {
  const marker = join(state, 'firefox-paired')
  // The relay address to type goes through a pass-through that prints the fake phone's number.
  const proxy = await startRelayProxy(relay.base, (line) => {
    console.log(line)
  })
  console.log(JSON.stringify({ manual_pairing: { browser: name, relay: proxy.base, marker } }))
  log(name, `pair by hand, compare the number with fake_check, then: touch ${marker}`)
  await waitFor('the pairing by hand', () => existsSync(marker), 15 * 60_000)
  return readFileSync(marker, 'utf8').trim() || `${name} test`
}

const helpers = { log, waitFor, clickKey }

async function flow(name, browser, relay, site, agentName) {
  const tab = await browser.newPage()
  await tab.bringToFront()

  log(name, 'fill a login')
  await tab.goto(`${site}/login`)
  await clickKey(tab, '#password')
  await waitFor('the filled password', () =>
    tab.$eval('#password', (el) => el.value === 'correct horse battery staple'),
  )
  const user = await tab.$eval('#email', (el) => el.value)
  if (user !== 'alex@example.com') throw new Error(`user name ${user}`)
  await sleep(2500)

  log(name, 'fill a login for the user name in the field')
  await tab.goto(`${site}/login`)
  await tab.type('#email', 'alex@example.com', { delay: 30 })
  await clickKey(tab, '#password')
  await waitFor('the filled password', () =>
    tab.$eval('#password', (el) => el.value === 'correct horse battery staple'),
  )
  const asked = (await (await relay.control('/_fake/seen')).json()).filter(
    (s) => s.request.kind === 'login' && s.request.agent === agentName,
  )
  const target = asked.at(-1)?.request.target
  if (target !== `${new URL(site).hostname}/alex@example.com`) throw new Error(`target ${target}`)
  log(name, `the request named the account: ${target}`)
  await sleep(2000)

  log(name, 'fill a code')
  await tab.goto(`${site}/otp`)
  await clickKey(tab, '#code')
  await waitFor('the filled code', () => tab.$eval('#code', (el) => el.value === '190274'))
  await sleep(2000)

  log(name, 'fill a code into six boxes')
  await tab.goto(`${site}/boxes`)
  await clickKey(tab, '#d0', '#d5')
  await waitFor('the filled boxes', () =>
    tab.$$eval('.box', (els) => els.map((e) => e.value).join('') === '190274'),
  )
  await sleep(2000)

  log(name, 'save a new login')
  const newPassword = `Synthetic-${name}-${Date.now() % 100000}`
  await tab.goto(`${site}/signup`)
  await tab.type('#email', `new-${name.toLowerCase()}@example.com`, { delay: 30 })
  await tab.type('#new', newPassword, { delay: 30 })
  await tab.type('#repeat', newPassword, { delay: 30 })
  await sleep(500)
  await Promise.all([tab.waitForNavigation(), tab.click('#create')])
  // The save question takes the focus; Enter answers Save.
  await sleep(2500)
  await tab.keyboard.press('Enter')
  const saved = await waitFor('the save on the phone', async () => {
    const seen = await (await relay.control('/_fake/seen')).json()
    return seen.find((s) => s.request.kind === 'save' && s.request.agent === agentName)
  })
  if (saved.saved_password !== newPassword) throw new Error('the phone opened a different password')
  if (saved.request.save.username !== `new-${name.toLowerCase()}@example.com`) {
    throw new Error(`saved user name ${saved.request.save.username}`)
  }
  log(name, 'the phone opened the sealed password and saved the login')
  await sleep(3000)
}

/** Waits for the passkey page's status line to leave `busy`; fails on an error text. */
async function passkeyStatus(tab, busy) {
  const text = await waitFor(
    'the passkey page',
    async () => {
      const t = await tab.$eval('#status', (el) => el.textContent ?? '')
      return t === busy ? null : t
    },
    60_000,
  )
  if (text.startsWith('Error')) throw new Error(`passkey page: ${text}`)
  return text
}

async function passkeyFlow(name, browser, relay, site) {
  const tab = await browser.newPage()
  await tab.bringToFront()
  const seen = async () =>
    (await (await relay.control('/_fake/seen')).json()).filter((s) => s.request.kind === 'passkey')
  const before = (await seen()).length
  const user = `${name.toLowerCase()}-passkey@example.com`
  await tab.goto(`${site.base}/passkey`)

  log(name, 'conditional passkey request: never reaches the phone')
  const conditional = await tab.evaluate(async () => {
    const available = await PublicKeyCredential.isConditionalMediationAvailable()
    const controller = new AbortController()
    const pending = navigator.credentials
      .get({
        mediation: 'conditional',
        signal: controller.signal,
        publicKey: { challenge: new Uint8Array(32) },
      })
      .then(
        () => 'resolved',
        (e) => e.name,
      )
    await new Promise((r) => setTimeout(r, 1000))
    controller.abort(new DOMException('test', 'AbortError'))
    return { available, outcome: await pending }
  })
  if (conditional.available !== false || conditional.outcome !== 'AbortError') {
    throw new Error(`conditional request: ${JSON.stringify(conditional)}`)
  }
  if ((await seen()).length !== before) throw new Error('a conditional request reached the phone')

  // The driver's own call counts as a click: wait until that activation is over (5 s).
  log(name, 'a passkey request without a click: refused before the phone')
  const unasked = await tab.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 6000))
    return navigator.credentials
      .create({
        publicKey: {
          rp: { name: 'Test site' },
          user: { id: new Uint8Array(16), name: 'alex@example.com', displayName: 'Alex' },
          challenge: new Uint8Array(32),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        },
      })
      .then(
        () => 'resolved',
        (e) => e.name,
      )
  })
  if (unasked !== 'NotAllowedError') throw new Error(`request without a click: ${unasked}`)
  if ((await seen()).length !== before)
    throw new Error('a request without a click reached the phone')

  log(name, 'create a passkey')
  await tab.$eval('#email', (el, v) => (el.value = v), user)
  await tab.click('#create')
  log(name, await passkeyStatus(tab, 'Creating'))
  await sleep(2000)

  log(name, 'sign in with the passkey')
  await tab.click('#signin')
  const signedIn = await passkeyStatus(tab, 'Signing in')
  if (signedIn !== `Signed in as ${user}`) throw new Error(`passkey page: ${signedIn}`)
  log(name, `${signedIn}: the server checked the ES256 signature`)
  const requests = (await seen()).slice(before)
  const origins = requests.map((s) => {
    const cdj = Buffer.from(s.request.passkey.client_data_json, 'base64url').toString('utf8')
    return JSON.parse(cdj).origin
  })
  if (requests.length !== 2 || origins.some((o) => o !== site.base)) {
    throw new Error(`the phone saw ${JSON.stringify(origins)}`)
  }
  await sleep(2000)

  log(name, 'create a passkey with PRF and unlock a key with it')
  await tab.click('#prf-create')
  const enabled = await passkeyStatus(tab, 'Creating with PRF')
  if (!enabled.startsWith('PRF enabled for')) throw new Error(`passkey page: ${enabled}`)
  log(name, `${enabled}: the server checked the PRF output`)
  await sleep(2000)
  await tab.click('#prf-signin')
  const unlocked = await passkeyStatus(tab, 'Unlocking')
  if (!unlocked.startsWith('PRF key for')) throw new Error(`passkey page: ${unlocked}`)
  const prf = (await seen()).at(-1)?.request.passkey.prf
  if (!prf?.eval?.first) throw new Error(`the phone saw ${JSON.stringify(prf)}`)
  log(name, `${unlocked}: the same output again, checked by the server`)
  await sleep(2000)
}

/** Turns the passkey setting off: a new page load gets the browser's own WebAuthn again. */
async function passkeysOff(name, browser, base, site) {
  log(name, 'turn passkeys off')
  const page = await extensionPage(browser, `${base}/options.html`)
  const reply = await page.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'settings.set', patch: { passkeys: false } }),
  )
  if (!reply?.ok || reply.value.passkeys !== false) throw new Error('passkeys not turned off')
  await page.close()
  const tab = await browser.newPage()
  const native = () =>
    tab.evaluate(() => String(navigator.credentials.get).includes('[native code]'))
  await waitFor('the browser passkeys', async () => {
    await tab.goto(`${site.base}/passkey`)
    return native()
  })
  log(name, 'the page has the browser passkeys again')
  await tab.close()
}

async function chromium(env, site, relay) {
  const ext = join(chromiumHome, 'ext')
  mkdirSync(chromiumHome, { recursive: true })
  cpSync(join(root, 'dist/chromium'), ext, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: process.env.NODKEY_E2E_CHROMIUM ?? '/snap/bin/chromium',
    headless: false,
    pipe: true,
    enableExtensions: [ext],
    userDataDir: join(chromiumHome, 'profile'),
    defaultViewport: null,
    // The stand-in Google pages have a certificate made for this run.
    acceptInsecureCerts: true,
    env,
    args: [
      '--lang=nb',
      '--window-position=0,0',
      '--window-size=800,1000',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      // Never reach the real relay from a test. The stand-in Google pages run on this computer.
      `--host-resolver-rules=MAP relay.nodkey.app 127.0.0.1, MAP accounts.google.com 127.0.0.1, MAP ${PAY_HOST} 127.0.0.1`,
    ],
  })
  const worker = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
  )
  const base = worker.url().replace(/\/background\.js$/, '')
  await setRelay(browser, base, relay.base)
  // The tab activities, as the popup shows them, read in the background.
  const activities = async () => {
    const w = await (
      await browser.waitForTarget(
        (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
      )
    ).worker()
    const all = await w.evaluate(() => chrome.storage.session.get(null))
    return Object.entries(all)
      .filter(([k]) => k.startsWith('activity:'))
      .map(([, v]) => v)
  }
  return { browser, base, activities }
}

async function firefox(env) {
  mkdirSync(state, { recursive: true })
  const profile = join(state, 'firefox-profile')
  // NODKEY_E2E_FIREFOX_XPI: test a signed package as Firefox installs it. Firefox then checks
  // Mozilla's signature and refuses the extension without it.
  const xpi = process.env.NODKEY_E2E_FIREFOX_XPI
  if (xpi) {
    mkdirSync(join(profile, 'extensions'), { recursive: true })
    cpSync(xpi, join(profile, 'extensions', 'nodkey@kh-labs.dev.xpi'))
    log('Firefox', `installs the signed package ${xpi}`)
  }
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: process.env.NODKEY_E2E_FIREFOX ?? '/usr/bin/firefox',
    headless: false,
    userDataDir: profile,
    defaultViewport: null,
    acceptInsecureCerts: true,
    env,
    args: ['--window-size=800,1000'],
    extraPrefsFirefox: {
      'extensions.webextensions.uuids': JSON.stringify({ 'nodkey@kh-labs.dev': FIREFOX_UUID }),
      'intl.locale.requested': 'en-US',
      'signon.rememberSignons': false,
      // Never reach the real relay from a test: it resolves to this computer, where nothing answers.
      // The stand-in Google pages run on this computer too.
      'network.dns.localDomains': `relay.nodkey.app,accounts.google.com,${PAY_HOST}`,
      ...(xpi
        ? {
            'extensions.autoDisableScopes': 0,
            'extensions.enabledScopes': 15,
            'xpinstall.signatures.required': true,
          }
        : {}),
    },
  })
  // The extension opens its settings page on install; the pairing there is done by hand.
  if (!xpi) await browser.installExtension(join(root, 'dist/firefox'))
  return { browser, base: `moz-extension://${FIREFOX_UUID}` }
}

async function setRelay(browser, base, relayBase) {
  const page = await extensionPage(browser, `${base}/options.html`)
  const { reply, access } = await page.evaluate(async (relay) => {
    const reply = await chrome.runtime.sendMessage({ type: 'settings.set', patch: { relay } })
    return { reply, access: await chrome.permissions.contains({ origins: ['<all_urls>'] }) }
  }, relayBase)
  // Never let a test reach the real relay.
  if (!reply?.ok || reply.value.relay !== relayBase) {
    throw new Error(`relay not set: ${JSON.stringify(reply)}`)
  }
  if (!access)
    throw new Error('the extension has no website access; see docs/features/browser-e2e.md')
  await page.close()
}

async function main() {
  if (!existsSync(join(root, 'dist/chromium/manifest.json'))) throw new Error('run: npm run build')
  const external = option('--display', process.env.NODKEY_E2E_DISPLAY)
  const desktop = external
    ? { display: external, vncAddress: null, env: { ...process.env, DISPLAY: external }, stop() {} }
    : await startDesktop(join(state, 'desktop'), findVnc())
  log(`desktop ${desktop.display}${desktop.vncAddress ? `, VNC ${desktop.vncAddress}` : ''}`)
  if (desktop.vncAddress) console.log(JSON.stringify({ vnc_address: desktop.vncAddress }))
  const relay = await startRelay()
  const google = await startGoogle(state)
  const pay = await startPayFrames(state)
  const site = await startSite(google.base, pay.base)
  const open = []
  cleanup = () => {
    for (const b of open) b.process()?.kill()
    relay.child.kill()
    site.stop()
    google.stop()
    pay.stop()
    desktop.stop()
    rmSync(chromiumHome, { recursive: true, force: true })
  }
  try {
    // Time to attach a viewer before anything moves.
    await sleep(Number(process.env.NODKEY_E2E_START_DELAY ?? 0))
    if (which === 'chromium' || which === 'both') {
      const c = await chromium(desktop.env, site.base, relay)
      open.push(c.browser)
      const name = await pairByDriver('Chromium', c.browser, c.base, relay)
      if (!only) {
        await flow('Chromium', c.browser, relay, site.base, name)
        await coveredFlow('Chromium', c.browser, relay, site.base, helpers, true)
      }
      if (!only || signinOnly) {
        await signinFlow('Chromium', c.browser, relay, site.base, name, helpers, c.activities)
      }
      if (!only || generateOnly) {
        await generateFlow('Chromium', c.browser, relay, site.base, name, helpers, c.activities)
      }
      if (!only || cardsOnly) {
        await cardFlow('Chromium', c.browser, relay, site.base, name, helpers)
        await cardFrameFlow('Chromium', c.browser, relay, site.base, pay.base, helpers)
      }
      if (!only || passkeysOnly) {
        await passkeyFlow('Chromium', c.browser, relay, site)
        await passkeysOff('Chromium', c.browser, c.base, site)
      }
    }
    if (which === 'firefox' || which === 'both') {
      const f = await firefox(desktop.env)
      open.push(f.browser)
      const name = await pairByHand('Firefox', relay)
      if (!only) {
        await flow('Firefox', f.browser, relay, site.base, name)
        await coveredFlow('Firefox', f.browser, relay, site.base, helpers, false)
      }
      if (!only || signinOnly) {
        await signinFlow('Firefox', f.browser, relay, site.base, name, helpers, null)
      }
      if (!only || generateOnly) {
        await generateFlow('Firefox', f.browser, relay, site.base, name, helpers, null)
      }
      if (!only || cardsOnly) {
        await cardFlow('Firefox', f.browser, relay, site.base, name, helpers)
        await cardFrameFlow('Firefox', f.browser, relay, site.base, pay.base, helpers)
      }
      if (!only || passkeysOnly) await passkeyFlow('Firefox', f.browser, relay, site)
    }
    log('all flows passed')
    if (keep) {
      log('--keep: browsers stay open; press Ctrl-C to stop')
      await new Promise(() => {})
    }
  } finally {
    for (const b of open) await b.close().catch(() => {})
    relay.child.kill()
    site.stop()
    google.stop()
    pay.stop()
    desktop.stop()
    rmSync(chromiumHome, { recursive: true, force: true })
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup()
    process.exit(130)
  })
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
