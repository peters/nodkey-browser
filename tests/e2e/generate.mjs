// "Make a strong password" in a real browser (docs/features/generate-password.md): the menu of the
// Nodkey button in a field for a new password, the user name from the step before, the page's
// rules, both fields filled, no save question afterwards; a password change; "Use a saved login";
// a refusal. Invented data only.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The middle of the first menu choice: the menu (280 px wide) sits 6 px below the Nodkey button,
 * its right edge at the button's right edge (ui.ts and menuui.ts).
 */
async function firstChoice(page, selector) {
  return page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect()
    const size = Math.min(28, Math.max(20, r.height - 8))
    const keyRight = r.right - 6
    const keyBottom = r.top + (r.height - size) / 2 + size
    const left = Math.max(8, Math.min(keyRight - 280, window.innerWidth - 288))
    return { x: left + 120, y: keyBottom + 6 + 7 + 22 }
  })
}

/**
 * @param {string} name
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ control: (path: string, init?: RequestInit) => Promise<Response> }} relay
 * @param {string} site
 * @param {string} agentName
 * @param {{ log: Function, waitFor: Function, clickKey: Function }} helpers
 * @param {null | (() => Promise<{ kind: string, state: string }[]>)} activities the tab activities, where the driver can read them (Chromium)
 */
export async function generateFlow(name, browser, relay, site, agentName, helpers, activities) {
  const { log, waitFor, clickKey } = helpers
  const seen = async (kind) =>
    (await (await relay.control('/_fake/seen')).json()).filter(
      (s) => s.request.kind === kind && s.request.agent === agentName,
    )
  const mode = (m) =>
    relay.control('/_fake/mode', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
    })
  const values = (tab, ...ids) =>
    tab.evaluate((list) => list.map((id) => document.getElementById(id).value), ids)
  const tab = await browser.newPage()
  await tab.bringToFront()

  log(name, 'make a strong password on a sign-up in two steps')
  const user = `new-${name.toLowerCase()}@example.com`
  await tab.goto(`${site}/join`)
  await tab.type('#username', user, { delay: 30 })
  await Promise.all([tab.waitForNavigation(), tab.click('#next')])
  const saves = (await seen('save')).length
  await clickKey(tab, '#passwd')
  // A click on the menu counts after it was in place for a moment (issue #9).
  await sleep(600)
  const point = await firstChoice(tab, '#passwd')
  await tab.mouse.click(point.x, point.y)
  const [made, again] = await waitFor('the new password in both fields', async () => {
    const v = await values(tab, 'passwd', 'again')
    return v[0] && v[0] === v[1] ? v : null
  })
  if (made !== again || made.length < 12 || made.length > 40) {
    throw new Error(`filled ${made.length} and ${again.length} characters`)
  }
  const request = (await seen('generate')).at(-1)?.request
  const rules = request?.generate?.rules ?? {}
  if (
    request?.target !== 'localhost' ||
    request.generate.username !== user ||
    request.generate.url !== `${site}/join/password` ||
    request.generate.change ||
    rules.min_length !== 12 ||
    rules.max_length !== 40 ||
    !rules.passwordrules?.startsWith('minlength: 12;')
  ) {
    throw new Error(`the phone saw ${JSON.stringify(request)}`)
  }
  log(name, 'the phone made the password with the user name of the step before and the rules')
  await Promise.all([tab.waitForNavigation(), tab.click('#create')])
  // A save question would take the focus; Enter would answer Save.
  await sleep(2500)
  await tab.keyboard.press('Enter')
  await sleep(2000)
  if ((await seen('save')).length !== saves) throw new Error('the save question came')
  log(name, 'no save question after the sign-up')

  log(name, 'a suggested user name: no Nodkey button on the name step, the picked name goes on')
  await tab.goto(`${site}/signup/username`)
  const asks = (await seen('login')).length
  await clickKey(tab, '#custom')
  await sleep(1500)
  if ((await seen('login')).length !== asks) throw new Error('the name step asked for a login')
  await tab.click('#pick1')
  await Promise.all([tab.waitForNavigation(), tab.click('#next')])
  await clickKey(tab, '#passwd')
  await sleep(600)
  await tab.keyboard.press('Enter')
  await waitFor('the new password from the suggested name', async () => {
    const v = await values(tab, 'passwd', 'again')
    return v[0] && v[0] === v[1] ? v : null
  })
  const picked = (await seen('generate')).at(-1)?.request.generate
  if (picked?.username !== 'alex.new2026')
    throw new Error(`the phone saw ${JSON.stringify(picked)}`)
  log(name, 'the phone got the picked name alex.new2026')

  log(name, 'make a strong password on a password change')
  await tab.goto(`${site}/change`)
  await clickKey(tab, '#fresh')
  await sleep(600)
  // The menu has the focus on its first choice: Enter makes the password.
  await tab.keyboard.press('Enter')
  const changed = await waitFor('the new password on the change page', async () => {
    const v = await values(tab, 'fresh', 'confirm', 'current')
    return v[0] && v[0] === v[1] ? v : null
  })
  if (changed[2] !== '') throw new Error('the current password field was filled')
  const change = (await seen('generate')).at(-1)?.request.generate
  if (change?.change !== true || change.username !== 'alex@example.com') {
    throw new Error(`the phone saw ${JSON.stringify(change)}`)
  }
  log(name, 'the change form: new and confirm filled, change: true')

  log(name, 'the current password field fills the saved login, without a menu')
  await clickKey(tab, '#current')
  await waitFor('the saved password', async () => {
    const [current] = await values(tab, 'current')
    return current === 'correct horse battery staple'
  })
  await sleep(1500)

  log(name, '"Use a saved login" in the menu')
  await tab.goto(`${site}/join/password`)
  const logins = (await seen('login')).length
  await clickKey(tab, '#passwd')
  await sleep(600)
  await tab.keyboard.press('ArrowDown')
  await tab.keyboard.press('Enter')
  await waitFor('the saved login', async () => {
    const [p] = await values(tab, 'passwd')
    return p === 'correct horse battery staple'
  })
  if ((await seen('login')).length !== logins + 1) throw new Error('no login request')
  await sleep(1500)

  log(name, 'a refusal fills nothing')
  await mode('deny')
  try {
    await tab.goto(`${site}/join/password`)
    const asked = (await seen('generate')).length
    await clickKey(tab, '#passwd')
    await sleep(600)
    await tab.keyboard.press('Enter')
    await waitFor('the refused request', async () => (await seen('generate')).length > asked)
    // The texts are in the browser's language (Norwegian in Chromium): the check reads the state.
    if (activities) {
      await waitFor('the refusal card', async () =>
        (await activities()).some((a) => a.kind === 'generate' && a.state === 'denied'),
      )
    } else {
      await sleep(2000)
    }
    const [p, c] = await values(tab, 'passwd', 'again')
    if (p || c) throw new Error('a refused request filled the fields')
  } finally {
    await mode('approve')
  }
  log(name, 'make a strong password: all passed')
  await sleep(1500)
  await tab.close()
}
