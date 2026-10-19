// Builds the store material of the extension from store/listing/<lang>.json and store/scenes.html:
//   node scripts/store.mjs              # check the texts, then render everything into store/out/
//   node scripts/store.mjs --check      # only check the text limits
//   node scripts/store.mjs --only nb    # one language
// Output, per store and store locale (docs/publishing/store-material.md):
//   store/out/firefox/<amo locale>/01-sign-in.png … 05-one-place.png and listing.txt
//   store/out/chrome/<chrome locale>/01-sign-in.png … 05-one-place.png, promo-440x280.png,
//   marquee-1400x560.png and listing.txt
// Needs Chromium: NODKEY_STORE_CHROMIUM, else /snap/bin/chromium.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const checkOnly = args.includes('--check')

// The strictest limit of AMO and the Chrome Web Store for each field.
const LIMITS = {
  name: 45,
  summary: 132,
  description: 15000,
  notes: 3000,
  captionTitle: 44,
  captionText: 90,
}
const SHOTS = ['01-sign-in', '02-codes', '03-save', '04-passkeys', '05-one-place', '06-cards']
// The Chrome Web Store takes at most five screenshots: cards replace the save screenshot there.
const CHROME_SHOTS = ['01-sign-in', '02-codes', '06-cards', '04-passkeys', '05-one-place']

/**
 * @typedef {{ title: string, text: string }} Caption
 * @typedef {{ lang: string, label: string, chromeLocale: string, amoLocale: string, name: string,
 *   summary: string, description: string, notes: string, captions: Caption[],
 *   ui: Record<string, string> }} Listing
 */

/** @type {Listing[]} */
const listings = readdirSync(join(root, 'store/listing'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    lang: f.replace(/\.json$/, ''),
    ...JSON.parse(readFileSync(join(root, 'store/listing', f), 'utf8')),
  }))
  .filter((l) => !only || l.lang === only)

/** @type {string[]} */
const problems = []
const keys = Object.keys(listings.find((l) => l.lang === 'en')?.ui ?? {})
for (const l of listings) {
  if (l.name.length > LIMITS.name)
    problems.push(`${l.lang}.name: ${l.name.length} > ${LIMITS.name}`)
  if (l.summary.length > LIMITS.summary)
    problems.push(`${l.lang}.summary: ${l.summary.length} > ${LIMITS.summary}`)
  if (l.description.length > LIMITS.description) problems.push(`${l.lang}.description too long`)
  // The version notes of this release (AMO "Release notes"; the Chrome Web Store has none).
  if (!l.notes) problems.push(`${l.lang}.notes is missing`)
  else if (l.notes.length > LIMITS.notes) problems.push(`${l.lang}.notes too long`)
  if (l.captions.length !== SHOTS.length)
    problems.push(`${l.lang}: ${SHOTS.length} captions expected`)
  l.captions.forEach((c, i) => {
    if (c.title.length > LIMITS.captionTitle)
      problems.push(`${l.lang}.captions[${i}].title: ${c.title.length}`)
    if (c.text.length > LIMITS.captionText)
      problems.push(`${l.lang}.captions[${i}].text: ${c.text.length}`)
  })
  for (const k of keys) if (!l.ui?.[k]) problems.push(`${l.lang}.ui.${k} is missing`)
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`texts ok (${listings.length} languages)`)
if (checkOnly) process.exit(0)

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
  const file = join(root, path)
  if (!file.startsWith(join(root, 'store')) && !file.startsWith(join(root, 'public')))
    return res.writeHead(404).end()
  try {
    res
      .writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      .end(readFileSync(file))
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(null)))
const address = /** @type {import('node:net').AddressInfo} */ (server.address())
const base = `http://127.0.0.1:${address.port}/store/scenes.html`

const browser = await puppeteer.launch({
  executablePath: process.env.NODKEY_STORE_CHROMIUM ?? '/snap/bin/chromium',
  headless: true,
  args: ['--hide-scrollbars', '--font-render-hinting=none'],
})
const page = await browser.newPage()
/** @param {string} query @param {number} width @param {number} height @param {string} out */
async function render(query, width, height, out) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  await page.goto(`${base}?${query}`, { waitUntil: 'load' })
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 })
  // The caption must end above the browser window (y 300) in the screenshots.
  const bottom = await page.evaluate(() => {
    const t = document.getElementById('text')
    return t ? t.offsetTop + t.offsetHeight : 0
  })
  if (bottom > 292) problems.push(`${out}: the caption is too long (ends at ${bottom}px)`)
  await page.screenshot({ path: out })
}

const outRoot = join(root, 'store/out')
if (!only) rmSync(outRoot, { recursive: true, force: true })
for (const l of listings) {
  /** @type {[string, string, string][]} */
  const stores = [
    ['firefox', 'Firefox', l.amoLocale],
    ['chrome', 'Chrome', l.chromeLocale],
  ]
  for (const [store, browserName, locale] of stores) {
    const dir = join(outRoot, store, locale)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const shots = store === 'chrome' ? CHROME_SHOTS : SHOTS
    for (const name of shots) {
      await render(
        `lang=${l.lang}&browser=${browserName}&scene=${SHOTS.indexOf(name) + 1}`,
        1280,
        800,
        join(dir, `${name}.png`),
      )
    }
    if (store === 'chrome') {
      await render(
        `lang=${l.lang}&browser=Chrome&scene=promo`,
        440,
        280,
        join(dir, 'promo-440x280.png'),
      )
      await render(
        `lang=${l.lang}&browser=Chrome&scene=marquee`,
        1400,
        560,
        join(dir, 'marquee-1400x560.png'),
      )
    }
    const captions = shots
      .map((name) => {
        const c = l.captions[SHOTS.indexOf(name)]
        return `${name}: ${c?.title} ${c?.text}`
      })
      .join('\n')
    writeFileSync(
      join(dir, 'listing.txt'),
      `Name\n${l.name}\n\nSummary\n${l.summary}\n\nDescription\n${l.description}\n\nVersion notes\n${l.notes}\n\nScreenshot captions\n${captions}\n`,
    )
  }
  console.log(`${l.lang}: done`)
}
await browser.close()
server.close()

// The review page (store/out/index.html): every language and store with its texts and images.
if (!only) {
  const data = Object.fromEntries(
    listings.map((l) => [
      l.lang,
      {
        label: l.label,
        chromeLocale: l.chromeLocale,
        amoLocale: l.amoLocale,
        name: l.name,
        summary: l.summary,
        description: l.description,
        notes: l.notes,
        captions: l.captions,
      },
    ]),
  )
  const logo = readFileSync(join(root, 'public/icons/logo.svg')).toString('base64')
  const page = readFileSync(join(root, 'store/preview.html'), 'utf8')
    .replace('__LOGO__', logo)
    .replace('__DATA__', JSON.stringify(data))
    .replace('__SHOTS__', JSON.stringify(SHOTS))
    .replace('__CHROME_SHOTS__', JSON.stringify(CHROME_SHOTS))
  writeFileSync(join(outRoot, 'index.html'), page)
  console.log('review page: store/out/index.html')
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
