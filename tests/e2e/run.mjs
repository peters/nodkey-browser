// Runs the extension in real Chromium and Firefox on an isolated desktop, against nodkey-cli's
// fake relay and phone and a synthetic test site: pair, fill a login, fill a code (one field and a
// row of boxes), and save a new login. See docs/features/browser-e2e.md.
//
//   node tests/e2e/run.mjs [--browser chromium|firefox|both] [--keep] [--display :N]
//
// Without --display it starts its own Xvfb + x11vnc (set NODKEY_E2E_TOOLS to an unpacked tools
// root when x11vnc is not installed) and prints the VNC address for a Horizon Device panel.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { findVnc, startDesktop } from './desktop.mjs'
import { startSite } from './site.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const which = option('--browser', 'both')
const keep = args.includes('--keep')
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
  await sleep(300)
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
  console.log(JSON.stringify({ manual_pairing: { browser: name, relay: relay.base, marker } }))
  log(name, `pair by hand, then: touch ${marker}`)
  await waitFor('the pairing by hand', () => existsSync(marker), 15 * 60_000)
  return readFileSync(marker, 'utf8').trim() || `${name} test`
}

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
    env,
    args: [
      '--lang=nb',
      '--window-position=0,0',
      '--window-size=800,1000',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      // Never reach the real relay from a test.
      '--host-resolver-rules=MAP relay.nodkey.app 127.0.0.1',
    ],
  })
  const worker = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
  )
  const base = worker.url().replace(/\/background\.js$/, '')
  await setRelay(browser, base, relay.base)
  return { browser, base }
}

async function firefox(env) {
  mkdirSync(state, { recursive: true })
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: process.env.NODKEY_E2E_FIREFOX ?? '/usr/bin/firefox',
    headless: false,
    userDataDir: join(state, 'firefox-profile'),
    defaultViewport: null,
    env,
    args: ['--window-size=800,1000'],
    extraPrefsFirefox: {
      'extensions.webextensions.uuids': JSON.stringify({ 'nodkey@kh-labs.dev': FIREFOX_UUID }),
      'intl.locale.requested': 'en-US',
      'signon.rememberSignons': false,
      // Never reach the real relay from a test: it resolves to this computer, where nothing answers.
      'network.dns.localDomains': 'relay.nodkey.app',
    },
  })
  // The extension opens its settings page on install; the pairing there is done by hand.
  await browser.installExtension(join(root, 'dist/firefox'))
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
  const site = await startSite()
  const open = []
  cleanup = () => {
    for (const b of open) b.process()?.kill()
    relay.child.kill()
    site.stop()
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
      await flow('Chromium', c.browser, relay, site.base, name)
    }
    if (which === 'firefox' || which === 'both') {
      const f = await firefox(desktop.env)
      open.push(f.browser)
      const name = await pairByHand('Firefox', relay)
      await flow('Firefox', f.browser, relay, site.base, name)
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
