// A synthetic test site with the forms Nodkey fills: a sign-in, a one-time code page, a row of
// code boxes, a sign-up, and a passkey page whose server checks the passkeys as a real website
// does. Invented data only.
import { createServer } from 'node:http'
import { relyingParty } from './webauthn.mjs'

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font:16px system-ui;margin:40px;max-width:520px}label{display:block;margin:14px 0 4px}
input{font:inherit;padding:10px;width:100%;box-sizing:border-box}button{font:inherit;margin-top:18px;padding:10px 18px}
.box{width:44px;display:inline-block;text-align:center;margin-right:6px}.banner{background:#ffe9a8;padding:8px 12px;border-radius:8px}
</style></head><body><p class="banner">Nodkey test site: synthetic data only</p><h1>${title}</h1>${body}</body></html>`

// The page side of the passkey page: options from the server, WebAuthn, the answer back. It reads
// the credential through the ArrayBuffer API (as most websites do) and checks toJSON() too.
const PASSKEY_SCRIPT = `
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
  const json = { id: cred.id, rawId: b64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment, response, clientExtensionResults: cred.getClientExtensionResults() }
  if (JSON.stringify(sorted(cred.toJSON())) !== JSON.stringify(sorted(json))) throw new Error('toJSON() differs: ' + JSON.stringify(cred.toJSON()))
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
  '/passkey': page(
    'Passkeys',
    `<label for="email">E-mail</label><input id="email" value="alex@example.com" autocomplete="username webauthn">
    <button id="create">Create a passkey</button> <button id="signin">Sign in with a passkey</button>
    <p id="status" role="status">Ready</p>
    <script>${PASSKEY_SCRIPT}</script>`,
  ),
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
    '/passkey/login/options': () => rp.loginOptions(),
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
 * (`rp`, for checks) and a stop function.
 */
export function startSite() {
  /** @type {ReturnType<typeof relyingParty> | null} */
  let rp = null
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (rp && (await passkeyApi(rp, path, req, res))) return
    const html = PAGES[/** @type {keyof typeof PAGES} */ (path)]
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
      resolve({ base, rp, stop: () => server.close() })
    })
  })
}
