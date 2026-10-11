// A synthetic test site with the forms Nodkey fills: a sign-in, a one-time code page, a row of
// code boxes, and a sign-up. Invented data only.
import { createServer } from 'node:http'

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font:16px system-ui;margin:40px;max-width:520px}label{display:block;margin:14px 0 4px}
input{font:inherit;padding:10px;width:100%;box-sizing:border-box}button{font:inherit;margin-top:18px;padding:10px 18px}
.box{width:44px;display:inline-block;text-align:center;margin-right:6px}.banner{background:#ffe9a8;padding:8px 12px;border-radius:8px}
</style></head><body><p class="banner">Nodkey test site: synthetic data only</p><h1>${title}</h1>${body}</body></html>`

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
}

/** Starts the site on a free loopback port; resolves to its base URL and a stop function. */
export function startSite() {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
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
      resolve({ base: `http://localhost:${addr.port}`, stop: () => server.close() })
    })
  })
}
