// A stand-in payment provider for the browser test: card fields in frames of their own on
// https://js.pay.example:<port>, as payment providers put them into a shop's page. The browsers
// resolve js.pay.example to this computer and accept the certificate that openssl makes for the
// run. Test card numbers only (docs/features/fill-card.md).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { join } from 'node:path'

export const PAY_HOST = 'js.pay.example'

const style = `body{font:15px system-ui;margin:0;padding:6px}input{font:inherit;padding:8px;width:100%;
box-sizing:border-box;margin:2px 0}label{font-size:12px;color:#555}`

// The frame tells the shop's page where its fields are and what they hold, as a provider's
// frame talks to its page. The test reads both from the top page: the driver cannot always
// reach into frames of another site.
const REPORT = `<script>
const report = (what) => parent.postMessage({ frame: location.pathname, ...what }, '*')
const rects = () => Object.fromEntries([...document.querySelectorAll('input')].map((el) => {
  const r = el.getBoundingClientRect()
  return [el.id, { left: r.left, top: r.top, right: r.right, height: r.height }]
}))
addEventListener('load', () => report({ rects: rects() }))
for (const el of document.querySelectorAll('input')) {
  el.addEventListener('input', () => report({ field: el.id, value: el.value }))
}
</script>`

/** @param {string} body */
const frame = (body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}${REPORT}</body></html>`

const NUMBER = `<label for="number">Card number</label>
<input id="number" autocomplete="cc-number" inputmode="numeric" placeholder="1234 1234 1234 1234">`
const EXP = `<label for="exp">Expiry</label><input id="exp" autocomplete="cc-exp" placeholder="MM / YY">`
const CVC = `<label for="cvc">CVC</label><input id="cvc" autocomplete="cc-csc" inputmode="numeric">`

/** The frames: all card fields in one, or one field in each (`/frame/number` and so on). */
const FRAMES = {
  '/frame': frame(NUMBER + EXP + CVC),
  '/frame/number': frame(NUMBER),
  '/frame/exp': frame(EXP),
  '/frame/cvc': frame(CVC),
}

/**
 * The shop's pages that hold the frames: a billing page with no total (a card for later
 * payments) and the same with one frame for each field.
 * @param {string} pay the provider's base address
 */
export function billingPages(pay) {
  const iframe = (id, path, height) =>
    `<iframe id="${id}" src="${pay}${path}" style="width:100%;height:${height}px;border:1px solid #ccc;border-radius:8px"></iframe>`
  // What the frames reported: the place of each field and the values, for the test to read.
  const listen = `<pre id="frames" hidden>{}</pre><script>
  const frames = {}
  addEventListener('message', (e) => {
    if (e.origin !== '${pay}') return
    const f = (frames[e.data.frame] ??= { values: {} })
    if (e.data.rects) f.rects = e.data.rects
    if (e.data.field) f.values[e.data.field] = e.data.value
    document.getElementById('frames').textContent = JSON.stringify(frames)
  })
  </script>`
  return {
    '/billing': {
      title: 'Betalingskort',
      body: `<p>Legg til et kort for abonnementet. Det trekkes ved neste fornyelse.</p>
      ${iframe('pay', '/frame', 200)}<button id="save">Lagre kort</button>${listen}`,
    },
    '/billing-split': {
      title: 'Betalingskort',
      body: `<p>Legg til et kort for abonnementet.</p>
      ${iframe('pay-number', '/frame/number', 70)}${iframe('pay-exp', '/frame/exp', 70)}
      ${iframe('pay-cvc', '/frame/cvc', 70)}<button id="save">Lagre kort</button>${listen}`,
    },
  }
}

/** Starts the provider's frames on a free loopback port. @param {string} state */
export function startPayFrames(state) {
  mkdirSync(state, { recursive: true })
  const key = join(state, 'pay-key.pem')
  const cert = join(state, 'pay-cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      `/CN=${PAY_HOST}`,
      '-addext',
      `subjectAltName=DNS:${PAY_HOST}`,
    ],
    { stdio: 'ignore' },
  )
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    const html = FRAMES[/** @type {keyof typeof FRAMES} */ (path)]
    if (!html) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address())
      resolve({ base: `https://${PAY_HOST}:${addr.port}`, stop: () => server.close() })
    })
  })
}
