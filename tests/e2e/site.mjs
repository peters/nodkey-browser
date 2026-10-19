// A synthetic test site with the forms Nodkey fills: a sign-in, a one-time code page, a row of
// code boxes, a sign-up, a checkout with card fields, and a passkey page whose server checks the passkeys as a real website
// does. Invented data only.
import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { billingPages } from './payframe.mjs'
import { sitePages } from './provider.mjs'
import { relyingParty } from './webauthn.mjs'

const page = (
  title,
  body,
  lang = 'en',
) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font:16px system-ui;margin:40px;max-width:520px}label{display:block;margin:14px 0 4px}
input{font:inherit;padding:10px;width:100%;box-sizing:border-box}button{font:inherit;margin-top:18px;padding:10px 18px}
.box{width:44px;display:inline-block;text-align:center;margin-right:6px}.banner{background:#ffe9a8;padding:8px 12px;border-radius:8px}
</style></head><body><p class="banner">Nodkey test site: synthetic data only</p><h1>${title}</h1>${body}</body></html>`

// The page side of the passkey page: options from the server, WebAuthn, the answer back. It reads
// the credential through the ArrayBuffer API (as most websites do) and checks toJSON() too. Then it
// replaces toJSON in strict code, as @github/webauthn-json does (GitHub).
const PASSKEY_SCRIPT = `'use strict'
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const status = (text) => { document.getElementById('status').textContent = text }
const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  const v = await r.json()
  if (!r.ok) throw new Error(v.error)
  return v
}
const ids = (list) => (list ?? []).map((d) => ({ ...d, id: bytes(d.id) }))
const sorted = (v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v
function asJson(cred) {
  if (!(cred instanceof PublicKeyCredential)) throw new Error('not a PublicKeyCredential')
  const r = cred.response
  const response = { clientDataJSON: b64u(r.clientDataJSON) }
  if (r instanceof AuthenticatorAttestationResponse) {
    Object.assign(response, { attestationObject: b64u(r.attestationObject), authenticatorData: b64u(r.getAuthenticatorData()),
      publicKey: b64u(r.getPublicKey()), publicKeyAlgorithm: r.getPublicKeyAlgorithm(), transports: r.getTransports() })
  } else {
    Object.assign(response, { authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) })
    if (r.userHandle) response.userHandle = b64u(r.userHandle)
  }
  const ext = cred.getClientExtensionResults()
  if (ext.prf?.results) {
    const r = ext.prf.results
    ext.prf.results = r.second ? { first: b64u(r.first), second: b64u(r.second) } : { first: b64u(r.first) }
  }
  const json = { id: cred.id, rawId: b64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment, response, clientExtensionResults: ext }
  if (JSON.stringify(sorted(cred.toJSON())) !== JSON.stringify(sorted(json))) throw new Error('toJSON() differs: ' + JSON.stringify(cred.toJSON()))
  cred.toJSON = () => json
  return json
}
document.getElementById('create').addEventListener('click', async () => {
  try {
    status('Creating')
    const name = document.getElementById('email').value
    const o = await post('/passkey/register/options', { name })
    const cred = await navigator.credentials.create({ publicKey: { ...o, challenge: bytes(o.challenge),
      user: { ...o.user, id: bytes(o.user.id) }, excludeCredentials: ids(o.excludeCredentials) } })
    await post('/passkey/register', { name, credential: asJson(cred) })
    status('Registered ' + name)
  } catch (e) { status('Error: ' + e.name + ': ' + e.message) }
})
// PRF: a passkey made with the extension, and a sign-in that asks for its output. The server
// checks the output against the fake phone's fixed credRandom.
const PRF_INPUT = new TextEncoder().encode('nodkey prf test')
document.getElementById('prf-create').addEventListener('click', async () => {
  try {
    status('Creating with PRF')
    const name = document.getElementById('email').value.replace('@', '-prf@')
    const o = await post('/passkey/register/options', { name })
    const cred = await navigator.credentials.create({ publicKey: { ...o, challenge: bytes(o.challenge),
      user: { ...o.user, id: bytes(o.user.id) }, excludeCredentials: ids(o.excludeCredentials),
      extensions: { prf: { eval: { first: PRF_INPUT } } } } })
    const json = asJson(cred)
    await post('/passkey/register', { name, credential: json })
    const prf = json.clientExtensionResults.prf
    if (!prf || prf.enabled !== true) throw new Error('prf.enabled is ' + (prf && prf.enabled))
    await post('/passkey/prf', { input: b64u(PRF_INPUT), output: prf.results.first })
    status('PRF enabled for ' + name)
  } catch (e) { status('Error: ' + e.name + ': ' + e.message) }
})
document.getElementById('prf-signin').addEventListener('click', async () => {
  try {
    status('Unlocking')
    const name = document.getElementById('email').value.replace('@', '-prf@')
    const o = await post('/passkey/login/options', { name })
    const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: bytes(o.challenge),
      allowCredentials: ids(o.allowCredentials), extensions: { prf: { eval: { first: PRF_INPUT } } } } })
    const json = asJson(cred)
    const v = await post('/passkey/login', { credential: json })
    await post('/passkey/prf', { input: b64u(PRF_INPUT), output: json.clientExtensionResults.prf.results.first })
    status('PRF key for ' + v.name)
  } catch (e) { status('Error: ' + e.name + ': ' + e.message) }
})
document.getElementById('signin').addEventListener('click', async () => {
  try {
    status('Signing in')
    const o = await post('/passkey/login/options')
    const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: bytes(o.challenge), allowCredentials: ids(o.allowCredentials) } })
    const v = await post('/passkey/login', { credential: asJson(cred) })
    status('Signed in as ' + v.name)
  } catch (e) { status('Error: ' + e.name + ': ' + e.message) }
})
`

const PAGES = {
  '/login': page(
    'Sign in',
    `<form method="post" action="/welcome">
    <label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username">
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
    <button>Sign in</button></form>`,
  ),
  '/otp': page(
    'Two-step code',
    `<form method="post" action="/welcome">
    <label for="code">Code from your authenticator</label>
    <input id="code" name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
    <button>Verify</button></form>`,
  ),
  '/boxes': page(
    'Enter the code',
    `<form method="post" action="/welcome"><div>${Array.from({ length: 6 }, (_, i) => `<input class="box" id="d${i}" maxlength="1" inputmode="numeric" aria-label="Digit ${i + 1}">`).join('')}</div>
    <button>Verify</button></form>`,
  ),
  '/signup': page(
    'Create an account',
    `<form method="post" action="/welcome">
    <label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username">
    <label for="new">Password</label><input id="new" name="password" type="password" autocomplete="new-password">
    <label for="repeat">Repeat the password</label><input id="repeat" name="repeat" type="password" autocomplete="new-password">
    <button id="create">Create account</button></form>`,
  ),
  '/welcome': page('Welcome', '<p>You are signed in to the test site.</p>'),
  // A sign-in page that hides Nodkey's button when the password field gets the focus:
  // ?mode=fade makes Nodkey's layer transparent, ?mode=cover lays an element over the button that
  // lets clicks through (docs/features/covered-button.md).
  '/covered': page(
    'Sign in',
    `<form method="post" action="/welcome">
    <label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username">
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
    <button>Sign in</button></form>
    <script>
    const mode = new URLSearchParams(location.search).get('mode')
    document.getElementById('password').addEventListener('focus', () => setTimeout(() => {
      const layer = document.querySelector('nodkey-ui')
      if (mode === 'fade' && layer) layer.style.setProperty('opacity', '0', 'important')
      if (mode === 'cover') {
        const r = document.getElementById('password').getBoundingClientRect()
        const d = document.createElement('div')
        d.id = 'cover'
        d.textContent = 'Free gift'
        Object.assign(d.style, { position: 'fixed', left: r.right - 70 + 'px', top: r.top - 6 + 'px',
          width: '90px', height: r.height + 12 + 'px', background: '#ffcc00', zIndex: '2147483647',
          pointerEvents: 'none' })
        document.documentElement.append(d)
      }
    }, 100))
    </script>`,
  ),
  // A checkout in Norwegian ("kr" is NOK): the total, a button that raises it, and card fields.
  '/checkout': page(
    'Kasse',
    `<div id="order"><div class="line"><span>USB-C-kabel 2 m</span> <span>399,00 kr</span></div>
    <div class="line"><span>Frakt</span> <span>100,00 kr</span></div>
    <div class="line"><span>Totalt</span> <strong id="total">499,00 kr</strong></div></div>
    <button type="button" id="gift">Legg til gavepapir (+100 kr)</button>
    <form method="post" action="/paid">
    <label for="cc-number">Kortnummer</label><input id="cc-number" autocomplete="cc-number" inputmode="numeric">
    <label for="cc-exp">Utløper</label><input id="cc-exp" autocomplete="cc-exp" placeholder="MM/ÅÅ" maxlength="5">
    <label for="cc-csc">CVC</label><input id="cc-csc" autocomplete="cc-csc" maxlength="4">
    <label for="cc-name">Navn på kortet</label><input id="cc-name" autocomplete="cc-name">
    <button id="pay">Betal</button></form>
    <script>document.getElementById('gift').addEventListener('click', () => {
      document.getElementById('total').textContent = '599,00 kr' })</script>`,
    'nb',
  ),
  '/paid': page('Takk', '<p>Bestillingen er sendt. Testdata, ingen ekte betaling.</p>', 'nb'),
  '/passkey': page(
    'Passkeys',
    `<label for="email">E-mail</label><input id="email" value="alex@example.com" autocomplete="username webauthn">
    <button id="create">Create a passkey</button> <button id="signin">Sign in with a passkey</button>
    <button id="prf-create">Create a passkey with PRF</button> <button id="prf-signin">Unlock with PRF</button>
    <p id="status" role="status">Ready</p>
    <script>${PASSKEY_SCRIPT}</script>`,
  ),
}

/**
 * The PRF output that Nodkey's fake phone gives for `input`: every passkey it makes has the
 * fixed credRandom of the nodkey-proto vectors (`prf.cred_random`). As WebAuthn says:
 * HMAC-SHA256(credRandom, SHA-256("WebAuthn PRF" || 0x00 || input)).
 */
const CRED_RANDOM = Buffer.from('NFzGvEstbwdMX6LmiQNdVFvEGvgPQOTVmPrqMvyGqP4', 'base64url')
function checkPrf(input, output) {
  const salt = createHash('sha256')
    .update(Buffer.concat([Buffer.from('WebAuthn PRF\0'), Buffer.from(input, 'base64url')]))
    .digest()
  const want = createHmac('sha256', CRED_RANDOM).update(salt).digest('base64url')
  if (output !== want) throw new Error('the PRF output is not the expected one')
  return { ok: true }
}

/** Reads a JSON request body. @param {import('node:http').IncomingMessage} req */
async function body(req) {
  let text = ''
  for await (const chunk of req) text += String(chunk)
  return JSON.parse(text || '{}')
}

/**
 * The passkey endpoints of the site. Returns `false` for other paths.
 * @param {ReturnType<typeof relyingParty>} rp
 * @param {string} path @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function passkeyApi(rp, path, req, res) {
  /** @type {Record<string, (v: any) => unknown>} */
  const routes = {
    '/passkey/register/options': (v) => rp.registerOptions(v.name),
    '/passkey/register': (v) => rp.register(v.credential, v.name),
    '/passkey/login/options': (v) => rp.loginOptions(v.name),
    '/passkey/prf': (v) => checkPrf(v.input, v.output),
    '/passkey/login': (v) => rp.login(v.credential),
  }
  const route = routes[path]
  if (!route || req.method !== 'POST') return false
  try {
    const out = route(await body(req))
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error }))
  }
  return true
}

/**
 * Starts the site on a free loopback port; resolves to its base URL, the passkey relying party
 * (`rp`, for checks) and a stop function. `google` is the stand-in for Google's sign-in pages,
 * `pay` the stand-in payment provider's frames.
 * @param {string} google @param {string} pay
 */
export function startSite(google, pay) {
  /** @type {ReturnType<typeof relyingParty> | null} */
  let rp = null
  /** @type {Record<string, string>} */
  let signin = {}
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (rp && (await passkeyApi(rp, path, req, res))) return
    const html = PAGES[/** @type {keyof typeof PAGES} */ (path)] ?? signin[path]
    if (!html) {
      res.writeHead(302, { location: '/login' }).end()
      return
    }
    req.resume()
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address())
      const base = `http://localhost:${addr.port}`
      rp = relyingParty('localhost', base)
      signin = sitePages(base, google)
      for (const [path, p] of Object.entries(billingPages(pay))) {
        signin[path] = page(p.title, p.body, 'nb')
      }
      resolve({ base, rp, stop: () => server.close() })
    })
  })
}
