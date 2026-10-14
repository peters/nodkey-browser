// The card flow of the browser test: pay on the test checkout page with the fake phone's test
// card, see the card leave the fields when the total goes up, and save a card typed by hand.
// See docs/features/fill-card.md. Test card numbers only.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {string} name @param {import('puppeteer-core').Browser} browser
 * @param {{ control: (path: string, init?: RequestInit) => Promise<Response> }} relay
 * @param {string} site @param {string} agentName
 * @param {{ log: (...m: unknown[]) => void, waitFor: (what: string, check: () => unknown, ms?: number) => Promise<any>, clickKey: (page: any, selector: string) => Promise<void> }} h
 */
export async function cardFlow(name, browser, relay, site, agentName, h) {
  const tab = await browser.newPage()
  await tab.bringToFront()
  const seen = async () => (await relay.control('/_fake/seen')).json()
  const value = (sel) => tab.$eval(sel, (el) => /** @type {HTMLInputElement} */ (el).value)

  h.log(name, 'pay with a card from the phone')
  await tab.goto(`${site}/checkout`)
  await h.clickKey(tab, '#cc-number')
  // The payment card takes the focus on "Approve on iPhone"; Enter presses it.
  await sleep(800)
  await tab.keyboard.press('Enter')
  await h.waitFor('the filled card', async () => (await value('#cc-number')) === '4242424242424242')
  if ((await value('#cc-exp')) !== '12/30') throw new Error(`expiry ${await value('#cc-exp')}`)
  if ((await value('#cc-csc')) !== '123') throw new Error('cvc not filled')
  const request = (await seen()).findLast((s) => s.request.kind === 'card')
  const card = request?.request.card
  if (
    request?.request.agent !== agentName ||
    card?.mode !== 'fill' ||
    card.merchant !== 'localhost' ||
    card.origin !== new URL(site).origin ||
    card.amount.value !== '499.00' ||
    card.amount.currency !== 'NOK' ||
    card.page_total.value !== '499.00' ||
    card.total_source !== 'page'
  ) {
    throw new Error(`the phone saw ${JSON.stringify(request?.request)}`)
  }
  h.log(name, 'the phone saw 499.00 NOK at localhost, read from the page; the card is filled')
  await sleep(2000)

  h.log(name, 'the total goes up: the card leaves the fields')
  await tab.click('#gift')
  await h.waitFor('the empty card fields', async () => (await value('#cc-number')) === '', 10_000)
  if ((await value('#cc-csc')) !== '' || (await value('#cc-exp')) !== '') {
    throw new Error('the expiry or CVC stayed')
  }
  await sleep(2500)

  h.log(name, 'save a card typed by hand')
  await tab.type('#cc-number', '5555 5555 5555 4444', { delay: 20 })
  await tab.type('#cc-exp', '11/31', { delay: 20 })
  await tab.type('#cc-csc', '321', { delay: 20 })
  await tab.type('#cc-name', 'Alex Example', { delay: 20 })
  await Promise.all([tab.waitForNavigation(), tab.click('#pay')])
  // The save question takes the focus; Enter answers Save.
  await sleep(2500)
  await tab.keyboard.press('Enter')
  const saved = await h.waitFor('the card save on the phone', async () =>
    (await seen()).find((s) => s.request.kind === 'save' && s.request.save_card),
  )
  if (saved.saved_card !== '5555555555554444' || saved.request.save_card.last4 !== '4444') {
    throw new Error('the phone opened a different card')
  }
  h.log(name, 'the phone opened the sealed card number and saved the card')
  await sleep(2500)
  await tab.close()
}
