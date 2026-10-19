// The covered-button flow of the browser test (issue #9): Nodkey's layer is not in a page before
// a field gets the focus, and a click on a button that the page hid or covered asks the phone
// nothing. See docs/features/covered-button.md.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {string} name @param {import('puppeteer-core').Browser} browser
 * @param {{ control: (path: string, init?: RequestInit) => Promise<Response> }} relay
 * @param {string} site
 * @param {{ log: (...m: unknown[]) => void, waitFor: (what: string, check: () => unknown, ms?: number) => Promise<any>, clickKey: (page: any, selector: string) => Promise<void> }} h
 * @param {boolean} tracksVisibility the browser reports covered elements (Chromium)
 */
export async function coveredFlow(name, browser, relay, site, h, tracksVisibility) {
  const tab = await browser.newPage()
  await tab.bringToFront()
  const requests = async () => (await (await relay.control('/_fake/seen')).json()).length
  const layer = () => tab.evaluate(() => document.querySelector('nodkey-ui') !== null)

  h.log(name, 'no Nodkey layer in a page before a field gets the focus')
  await tab.goto(`${site}/covered`)
  await sleep(1500)
  if (await layer()) throw new Error('the Nodkey layer is in the page before any focus')
  await tab.click('#email')
  await sleep(300)
  if (!(await layer())) throw new Error('no Nodkey layer after the focus')

  const modes = tracksVisibility ? ['fade', 'cover'] : ['fade']
  for (const mode of modes) {
    h.log(name, `a click on a button that the page hid (${mode}) asks nothing`)
    const before = await requests()
    await tab.goto(`${site}/covered?mode=${mode}`)
    await h.clickKey(tab, '#password')
    await sleep(2000)
    if ((await requests()) !== before) throw new Error(`the phone got a request (${mode})`)
    const filled = await tab.$eval('#password', (el) => /** @type {HTMLInputElement} */ (el).value)
    if (filled) throw new Error(`the password was filled (${mode})`)
  }

  // The same click on the same page without a trick fills: the clicks above hit the button.
  h.log(name, 'the same click on a visible button fills')
  await tab.goto(`${site}/covered`)
  await h.clickKey(tab, '#password')
  await h.waitFor('the filled password', () =>
    tab.$eval('#password', (el) => /** @type {HTMLInputElement} */ (el).value !== ''),
  )
  await tab.close()
}
