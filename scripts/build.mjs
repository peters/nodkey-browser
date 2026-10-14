// Builds the extension for both browsers: dist/chromium and dist/firefox (unpacked) plus a zip of
// each in dist/. `--watch` rebuilds the pages and the background on change (for development).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const watch = process.argv.includes('--watch')
/** @param {string} cmd @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
const run = (cmd, args, env = process.env) => execFileSync(cmd, args, { stdio: 'inherit', env })
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

if (!existsSync('src/wasm/nodkey.js')) run('node', ['scripts/wasm.mjs'])
run('node', ['scripts/locales.mjs'])
run('npx', ['vite', 'build', '--logLevel', 'warn'])
// The scripts in web pages: the content script, and the passkey bridge and page script that the
// background registers while passkeys are on.
for (const script of ['content', 'passkey-bridge', 'passkey-page']) {
  run('npx', ['vite', 'build', '-c', 'vite.content.config.ts', '--logLevel', 'warn'], {
    ...process.env,
    NODKEY_SCRIPT: script,
  })
}

const common = {
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDescription__',
  default_locale: 'en',
  version: pkg.version,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'popup.html',
    default_title: '__MSG_extName__',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  options_ui: { page: 'options.html', open_in_tab: true },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    { matches: ['<all_urls>'], js: ['content.js'], all_frames: true, run_at: 'document_idle' },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
}

const targets = {
  chromium: {
    ...common,
    minimum_chrome_version: '137',
    background: { service_worker: 'background.js', type: 'module' },
  },
  firefox: {
    ...common,
    background: { scripts: ['background.js'], type: 'module' },
    browser_specific_settings: {
      gecko: {
        id: 'nodkey@kh-labs.dev',
        strict_min_version: '140.0',
        // What leaves the browser, end to end encrypted to the person's own iPhone: logins (fill and
        // save), the site of each request and, when the setting is on, a picture of the page.
        data_collection_permissions: {
          required: ['authenticationInfo', 'financialAndPaymentInfo', 'websiteActivity', 'websiteContent'],
        },
      },
    },
  },
  // Safari loads the extension from the Mac app in safari/ (ADR-0008).
  safari: {
    ...common,
    background: { service_worker: 'background.js', type: 'module' },
    browser_specific_settings: { safari: { strict_min_version: '18.0' } },
  },
}

for (const [name, manifest] of Object.entries(targets)) {
  const out = `dist/${name}`
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  cpSync('dist/common', out, { recursive: true })
  writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
  rmSync(`dist/nodkey-${name}-${pkg.version}.zip`, { force: true })
  // Safari ships inside the Mac app, so it gets no zip.
  if (name !== 'safari') {
    execFileSync('zip', ['-qr', `../nodkey-${name}-${pkg.version}.zip`, '.'], { cwd: out })
  }
}
console.log(`built dist/chromium, dist/firefox and dist/safari (${pkg.version})`)
if (watch) {
  console.log('watching: npx vite build --watch')
  run('npx', ['vite', 'build', '--watch', '--outDir', 'dist/chromium', '--emptyOutDir', 'false'])
}
