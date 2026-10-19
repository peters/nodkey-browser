// Cards in a payment provider's frames (ADR-0013): a billing page with no total adds the card for
// later payments, and a page with one provider frame for each field pays an amount the person
// types. The top page shows Nodkey's card; the phone sees the top page's site as the merchant and
// the provider's host as `via`. See docs/features/fill-card.md. Test card numbers only.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * What the provider's frames reported to the top page: the place of each field and its value.
 * @param {import('puppeteer-core').Page} tab
 * @returns {Promise<Record<string, { rects?: Record<string, { left: number, top: number, right: number, height: number }>, values: Record<string, string> }>>}
 */
const reported = (tab) => tab.$eval('#frames', (el) => JSON.parse(el.textContent || '{}'))

/**
 * Clicks the field `field` in the frame of the iframe `iframe` (path `path`), then its Nodkey
 * button, with the mouse of the top page.
 * @param {import('puppeteer-core').Page} tab @param {string} iframe @param {string} path
 * @param {string} field @param {(what: string, check: () => unknown) => Promise<any>} waitFor
 */
async function clickKeyInFrame(tab, iframe, path, field, waitFor) {
  const r = await waitFor('the frame', async () => (await reported(tab))[path]?.rects?.[field])
  // Nodkey's script runs in the frame once it is loaded.
  await sleep(500)
  const outer = await (await tab.$(iframe))?.boundingBox()
  if (!outer) throw new Error(`frame ${iframe} is not shown`)
  // The frame's content starts inside its 1 px border.
  const x = outer.x + 1
  const y = outer.y + 1 + r.top + r.height / 2
  await tab.mouse.click(x + r.left + 20, y)
  // The button takes a click only after it was in place for a moment (issue #9).
  await sleep(600)
  const size = Math.min(28, Math.max(20, r.height - 8))
  await tab.mouse.click(x + r.right - size / 2 - 6, y)
}

/**
 * @param {string} name @param {import('puppeteer-core').Browser} browser
 * @param {{ control: (path: string, init?: RequestInit) => Promise<Response> }} relay
 * @param {string} site @param {string} pay the provider's base address
 * @param {{ log: (...m: unknown[]) => void, waitFor: (what: string, check: () => unknown, ms?: number) => Promise<any> }} h
 */
export async function cardFrameFlow(name, browser, relay, site, pay, h) {
  const tab = await browser.newPage()
  await tab.bringToFront()
  const lastCard = async () =>
    (await (await relay.control('/_fake/seen')).json()).findLast((s) => s.request.kind === 'card')
      ?.request.card
  /** @param {string} path the frame @param {string} field */
  const value = async (path, field) => (await reported(tab))[path]?.values[field] ?? ''
  const via = new URL(pay).hostname
  // Nodkey's card in the top page has the focus (its layer is the active element there).
  const cardShown = async () => {
    await h.waitFor('the card in the top page', () =>
      tab.evaluate(() => document.activeElement?.localName === 'nodkey-ui'),
    )
    await sleep(300)
  }

  h.log(name, 'a billing page with no total: add the card for later payments in the frame')
  await tab.goto(`${site}/billing`)
  await clickKeyInFrame(tab, '#pay', '/frame', 'number', h.waitFor)
  // The top page's card takes the focus on "Add the card for later payments"; Enter presses it.
  await cardShown()
  await tab.keyboard.press('Enter')
  await h.waitFor('the card in the frame', async () => (await value('/frame', 'cvc')) === '123')
  const filled = [
    await value('/frame', 'number'),
    await value('/frame', 'exp'),
    await value('/frame', 'cvc'),
  ]
  if (filled.join(' ') !== '4242424242424242 12 / 30 123') {
    throw new Error(`the frame has ${filled.join(' ')}`)
  }
  const setup = await lastCard()
  if (
    setup?.purpose !== 'setup' ||
    setup.merchant !== 'localhost' ||
    setup.via !== via ||
    setup.origin !== new URL(pay).origin ||
    setup.amount !== undefined
  ) {
    throw new Error(`the phone saw ${JSON.stringify(setup)}`)
  }
  h.log(name, `the phone saw "add a card at localhost via ${via}", no amount; the frame is filled`)
  await sleep(2000)

  h.log(name, 'one provider frame for each field: pay an amount the person types')
  await tab.goto(`${site}/billing-split`)
  await clickKeyInFrame(tab, '#pay-number', '/frame/number', 'number', h.waitFor)
  await cardShown()
  // "Pay an amount" is the second button; then the amount field has the focus.
  await tab.keyboard.press('Tab')
  await tab.keyboard.press('Enter')
  await sleep(300)
  await tab.keyboard.type('250')
  await tab.keyboard.press('Enter')
  await h.waitFor(
    'the number, expiry and CVC in their frames',
    async () =>
      (await value('/frame/number', 'number')) === '4242424242424242' &&
      (await value('/frame/exp', 'exp')) === '12 / 30' &&
      (await value('/frame/cvc', 'cvc')) === '123',
  )
  const paid = await lastCard()
  if (
    paid?.purpose !== undefined ||
    paid.via !== via ||
    paid.amount?.value !== '250' ||
    paid.amount.currency !== 'NOK' ||
    paid.total_source !== 'user'
  ) {
    throw new Error(`the phone saw ${JSON.stringify(paid)}`)
  }
  h.log(name, `the phone saw 250 NOK at localhost via ${via}; number, expiry and CVC are filled`)
  await sleep(2000)
  await tab.close()
}
