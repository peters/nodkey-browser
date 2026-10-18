// The sign-in flows of the browser test (docs/features/sign-in-methods.md): sign in to a site
// that uses only Google, with the Google login filled only on the stand-in Google pages and a code
// from Nodkey instead of "Check your phone"; the question "Remember that ... uses Google
// sign-in?"; an SMS code; and the agent limit. Invented data only.
import { GOOGLE_USER } from './provider.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PASSWORD = 'correct horse battery staple'

/**
 * @param {string} name @param {import('puppeteer-core').Browser} browser
 * @param {{ control: (path: string, init?: RequestInit) => Promise<Response> }} relay
 * @param {string} site @param {string} agentName
 * @param {{ log: (...m: unknown[]) => void, waitFor: (what: string, check: () => unknown, ms?: number) => Promise<any>, clickKey: (page: any, selector: string) => Promise<void> }} h
 * @param {(() => Promise<any[]>) | null} activities the tab activities, where the driver can read them (Chromium)
 */
export async function signinFlow(name, browser, relay, site, agentName, h, activities) {
  const tab = await browser.newPage()
  await tab.bringToFront()
  const put = (path, body) =>
    relay.control(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const seen = async () =>
    (await (await relay.control('/_fake/seen')).json()).filter((s) => s.request.agent === agentName)
  const value = (sel) => tab.$eval(sel, (el) => /** @type {HTMLInputElement} */ (el).value)
  const navigation = () => tab.waitForNavigation({ waitUntil: 'load' })
  // The texts are in the browser's language (Norwegian in Chromium), so the checks look at the
  // state and the numbers.
  const shown = async (what, check) => {
    if (!activities) return
    await h.waitFor(what, async () => (await activities()).some(check), 10_000)
  }

  h.log(name, 'sign in with Google: the site has no password, the phone knows the method')
  await put('/_fake/methods', {
    localhost: { kind: 'federated', provider: 'google', certainty: 'confirmed' },
  })
  await tab.goto(`${site}/federated`)
  await h.clickKey(tab, '#email')
  const login = await h.waitFor('the login request', async () =>
    (await seen()).findLast((s) => s.request.kind === 'login' && s.request.target === 'localhost'),
  )
  if (!login) throw new Error('no login request')
  // The method card takes the focus on "Sign in with Google"; Enter presses the page's button.
  await sleep(2000)
  if ((await value('#email')) !== '') throw new Error('the Google login was filled on the site')
  await Promise.all([navigation(), tab.keyboard.press('Enter')])
  if (!tab.url().startsWith('https://accounts.google.com:')) throw new Error(`at ${tab.url()}`)
  h.log(name, 'on the stand-in Google page; fill the Google login from the same approval')
  const asked = (await seen()).length
  await sleep(1500)
  await h.clickKey(tab, '#identifierId')
  await h.waitFor(
    'the Google user name',
    async () => (await value('#identifierId')) === GOOGLE_USER,
  )
  await sleep(1000)
  await Promise.all([navigation(), tab.click('#next')])
  await h.clickKey(tab, '#password')
  await h.waitFor('the Google password', async () => (await value('#password')) === PASSWORD)
  if ((await seen()).length !== asked) throw new Error('the Google login needed a new request')
  await sleep(1000)
  await Promise.all([navigation(), tab.click('#next')])

  h.log(name, '"Check your phone": the Nodkey button next to "Try another way" chooses a code')
  await sleep(2000)
  const r = await tab.$eval('#other', (el) => {
    const b = el.getBoundingClientRect()
    return { right: b.right, top: b.top, height: b.height }
  })
  await Promise.all([navigation(), tab.mouse.click(r.right + 8 + 14, r.top + r.height / 2)])
  if (!tab.url().includes('/signin/totp')) throw new Error(`at ${tab.url()}`)
  await h.waitFor('the Google code', async () => (await value('#totpPin')) === '190274')
  await sleep(1500)
  await Promise.all([navigation(), tab.click('#next')])
  const who = await tab.$eval('#who', (el) => el.textContent)
  if (who !== `Signed in with Google as ${GOOGLE_USER}`) throw new Error(`done page: ${who}`)
  h.log(name, who)
  await put('/_fake/methods', {})
  await sleep(2000)

  h.log(name, 'learn "Sign in with Google": ask to remember it, send a suggestion')
  const before = (await (await relay.control('/_fake/suggestions')).json()).length
  await tab.goto(`${site.replace('localhost', '127.0.0.1')}/learn`)
  await Promise.all([navigation(), tab.click('#google')])
  await sleep(1000)
  await Promise.all([navigation(), tab.click('#account')])
  // The question takes the focus on "Remember"; Enter answers it.
  await sleep(2500)
  await tab.keyboard.press('Enter')
  const suggestion = await h.waitFor('the suggestion on the phone', async () => {
    const list = await (await relay.control('/_fake/suggestions')).json()
    return list.length > before ? list.at(-1) : null
  })
  const method = suggestion.suggest.method
  if (
    suggestion.target !== '127.0.0.1' ||
    method.kind !== 'federated' ||
    method.provider !== 'google' ||
    method.source !== 'extension' ||
    suggestion.suggest.outcome !== 'signed_in'
  ) {
    throw new Error(`the phone queued ${JSON.stringify(suggestion)}`)
  }
  h.log(name, 'the phone queued "127.0.0.1 uses Google sign-in" from the extension')
  await sleep(2500)

  h.log(name, 'an SMS code: the Shortcuts automation gives it to the fake phone')
  await tab.goto(`${site}/sms`)
  await h.clickKey(tab, '#sms')
  await h.waitFor('the sms_code request', async () =>
    (await seen()).some((s) => s.request.kind === 'sms_code' && s.request.wait_seconds === 120),
  )
  await sleep(1500)
  await put('/_fake/sms', { text: 'Your code is 482913. Do not share it.' })
  await h.waitFor('the SMS code', async () => (await value('#sms')) === '482913')
  await sleep(2000)
  await tab.goto(`${site}/sms`)
  await h.clickKey(tab, '#sms')
  await sleep(1500)
  await put('/_fake/sms', { expire: true })
  await sleep(2500)
  if ((await value('#sms')) !== '') throw new Error('a code was filled without an SMS')
  await shown('the SMS hint', (a) => a.kind === 'sms' && a.state === 'expired')
  h.log(name, 'no SMS: the page shows the hint about the Shortcuts automation')
  await sleep(2500)

  h.log(name, 'the agent limit: a notice, then a pause')
  await put('/_fake/quota', { state: 'warning', new_today: 12, limit: 10 })
  await tab.goto(`${site}/login`)
  await h.clickKey(tab, '#password')
  await h.waitFor('the filled password', async () => (await value('#password')) === PASSWORD)
  await shown('the limit notice', (a) => a.state === 'approved' && a.note?.includes('12'))
  await sleep(4000)
  await put('/_fake/quota', { state: 'paused', new_today: 26, limit: 10 })
  await tab.goto(`${site}/login`)
  await h.clickKey(tab, '#password')
  await sleep(2500)
  if ((await value('#password')) !== '') throw new Error('filled while paused')
  await shown(
    'the pause',
    (a) => a.kind === 'login' && a.state === 'denied' && /Agent/.test(a.message),
  )
  await put('/_fake/quota', { state: 'off' })
  h.log(name, 'the pause says how to resume under Agents')
  await sleep(4000)
  await tab.close()
}
