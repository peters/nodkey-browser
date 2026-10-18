// The sign-in pages of the browser test: a site that signs in only with Google, a page that
// sends a code by SMS, and a stand-in for Google's own sign-in pages on
// https://accounts.google.com:<port>. The browsers resolve accounts.google.com to this computer
// (docs/features/sign-in-methods.md), so nothing reaches Google. Invented data only.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { join } from 'node:path'

/** The fake phone's Google login (nodkey-fake-relay `GOOGLE_USER`) and test password and code. */
export const GOOGLE_USER = 'alex.example@gmail.example'
const PASSWORD = 'correct horse battery staple'
const CODE = '190274'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font:16px system-ui;margin:40px;max-width:520px}label{display:block;margin:14px 0 4px}
input{font:inherit;padding:10px;width:100%;box-sizing:border-box}button,.button{font:inherit;margin-top:18px;padding:10px 18px;display:inline-block}
li{margin:10px 0}.banner{background:#ffe9a8;padding:8px 12px;border-radius:8px}
</style></head><body><p class="banner">Nodkey test site: synthetic data only</p><h1>${title}</h1>${body}</body></html>`

/**
 * The pages of the test site (http://localhost) for sign-in methods.
 * @param {string} site @param {string} google
 */
export function sitePages(site, google) {
  const done = encodeURIComponent(`${site}/federated/done`)
  return {
    '/federated': page(
      'Sign in to the render farm',
      `<form onsubmit="return false"><label for="email">E-mail</label>
      <input id="email" name="email" type="email" autocomplete="username"></form>
      <p>This site has no passwords.</p>
      <a id="google" class="button" href="${google}/signin?continue=${done}">Sign in with Google</a>`,
    ),
    // Opened as http://127.0.0.1: a site the phone knows no method for.
    '/learn': page(
      'Sign in to the notes',
      `<a id="google" class="button" href="#">Continue with Google</a><script>
      document.getElementById('google').href = '${google}/quick?continue=' +
        encodeURIComponent(location.origin + '/federated/done')
      </script>`,
    ),
    '/federated/done': page(
      'Welcome',
      `<p id="who">Signed in.</p><script>
      const user = new URLSearchParams(location.search).get('user')
      if (user) document.getElementById('who').textContent = 'Signed in with Google as ' + user
      </script>`,
    ),
    '/sms': page(
      'Enter the code',
      `<p>We sent a code by text message to •• 12.</p>
      <form method="post" action="/welcome"><label for="sms">Code</label>
      <input id="sms" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <button>Verify</button></form>`,
    ),
  }
}

/** The stand-in for Google's sign-in pages. @param {URLSearchParams} q */
function googlePage(path, q) {
  const hidden = ['continue', 'identifier']
    .filter((k) => q.has(k))
    .map((k) => `<input type="hidden" name="${k}" value="${esc(q.get(k))}">`)
    .join('')
  const keep = new URLSearchParams(
    ['continue', 'identifier'].filter((k) => q.has(k)).map((k) => [k, q.get(k) ?? '']),
  ).toString()
  switch (path) {
    case '/signin':
      return page(
        'Sign in with Google',
        `<form method="post" action="/signin/identifier">${hidden}
        <label for="identifierId">Email or phone</label>
        <input id="identifierId" name="identifier" type="email" autocomplete="username">
        <button id="next">Next</button></form>`,
      )
    case '/signin/pwd':
      return page(
        'Welcome',
        `<p>${esc(q.get('identifier'))}</p><form method="post" action="/signin/password">${hidden}
        <label for="password">Enter your password</label>
        <input id="password" name="Passwd" type="password" autocomplete="current-password">
        <button id="next">Next</button></form>`,
      )
    case '/signin/challenge':
      return page(
        'Check your phone',
        `<p>Google sent a notification to your phone. Tap Yes on the notification to continue.</p>
        <button id="other" type="button">Try another way</button>
        <ul id="ways" hidden>
        <li><a href="/signin/challenge?${keep}">Tap Yes on your phone or tablet</a></li>
        <li><a id="way-passkey" href="#">Use your passkey</a></li>
        <li><a id="way-totp" href="/signin/totp?${keep}">Get a verification code from the Google Authenticator app</a></li>
        <li><a id="way-sms" href="#">Get a verification code at (•••) •••-••12</a></li>
        </ul><script>document.getElementById('other').addEventListener('click', () => {
          document.getElementById('ways').hidden = false
          document.getElementById('other').hidden = true
        })</script>`,
      )
    case '/signin/totp':
      return page(
        '2-Step Verification',
        `<form method="post" action="/signin/finish">${hidden}
        <label for="totpPin">Enter the code from the Google Authenticator app</label>
        <input id="totpPin" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
        <button id="next">Next</button></form>`,
      )
    case '/quick':
      return page(
        'Choose an account',
        `<a id="account" class="button" href="${esc(q.get('continue'))}?user=${encodeURIComponent(GOOGLE_USER)}">${GOOGLE_USER}</a>`,
      )
    default:
      return null
  }
}

/** What each form post checks, and the page it goes to next. */
function googlePost(path, form) {
  const next = (to, extra = {}) => {
    const q = new URLSearchParams({ continue: form.get('continue') ?? '', ...extra })
    return `${to}?${q}`
  }
  const identifier = form.get('identifier') ?? ''
  switch (path) {
    case '/signin/identifier':
      return identifier === GOOGLE_USER ? next('/signin/pwd', { identifier }) : null
    case '/signin/password':
      return form.get('Passwd') === PASSWORD ? next('/signin/challenge', { identifier }) : null
    case '/signin/finish': {
      if (form.get('code') !== CODE) return null
      return `${form.get('continue')}?user=${encodeURIComponent(identifier)}`
    }
    default:
      return null
  }
}

/**
 * Starts the stand-in for Google on HTTPS with a certificate made for this run (the browsers
 * accept it because the run tells them to).
 * @param {string} state a private folder for the certificate
 */
export function startGoogle(state) {
  mkdirSync(state, { recursive: true })
  const key = join(state, 'google-key.pem')
  const cert = join(state, 'google-cert.pem')
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
      '/CN=accounts.google.com',
      '-addext',
      'subjectAltName=DNS:accounts.google.com',
    ],
    { stdio: 'ignore' },
  )
  const server = createServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    async (req, res) => {
      const url = new URL(req.url ?? '/', 'https://accounts.google.com')
      if (req.method === 'POST') {
        let body = ''
        for await (const chunk of req) body += String(chunk)
        const to = googlePost(url.pathname, new URLSearchParams(body))
        if (!to) {
          res
            .writeHead(400, { 'content-type': 'text/html' })
            .end(page('Wrong', '<p>Try again.</p>'))
          return
        }
        res.writeHead(303, { location: to }).end()
        return
      }
      const html = googlePage(url.pathname, url.searchParams)
      if (!html) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    },
  )
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address())
      resolve({ base: `https://accounts.google.com:${addr.port}`, stop: () => server.close() })
    })
  })
}
