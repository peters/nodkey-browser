# Nodkey browser extension: agent rules

The Nodkey extension for Firefox and Chromium. It asks Nodkey on the person's
iPhone for one login or one code, fills it into the page, and offers to save a
new login. Read `docs/adr/README.md` before you change behavior. The protocol is
`docs/agent-protocol.md` in `peters/nodkey-cli`; the iOS app and the relay are in
`peters/nodkey`.

Shared company rules apply: `fintermobilityas/company` (checkout `~/github/company`),
`AGENTS.md` and `docs/web-apps.md`.

## Layout

- `wasm/`: Rust crate that compiles `nodkey-proto` (a git dependency on
  `peters/nodkey-cli`, fixed revision) to WebAssembly. Thin exports only; the
  protocol logic stays in nodkey-cli.
- `tools/fake-relay/`: runs nodkey-cli's fake relay and phone for tests.
- `src/background/`: keys (WebCrypto, IndexedDB), relay client, pairing,
  requests, saves, message router.
- `src/content/`: the content script: field detection, fill, the closed shadow
  root UI. One classic script.
- `src/app/`, `src/features/`, `src/components/`: popup and options page (Vue 3).
- `src/i18n/messages/<lang>.json`: the twelve languages of the iPhone app.
- `tests/unit/`: tests that run the real background against the fake phone.
- `tests/e2e/`: the real-browser run (`docs/features/browser-e2e.md`).
- `docs/features/`: the visual test procedures (ASD-STE100). Do the ones that a change
  affects, and keep the evidence private (`docs/features/README.md`).

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install (Node 24.21, see `.nvmrc`) |
| `npm run wasm` | Build the WebAssembly module into `src/wasm` (needs `wasm-bindgen-cli` with the version in `Cargo.lock`) |
| `npm run validate` | Lint, format check, type checks, tests and build |
| `npm run build` | `dist/chromium`, `dist/firefox` and a zip of each |
| `npm run e2e -- --keep` | Real Chromium and Firefox on an isolated desktop |
| `cargo test` | The WebAssembly crate's tests (native) |
| `scripts/icons.sh` | Render the toolbar icons from `public/icons/logo.svg` (cairosvg) |

## Rules

- Keep each source file below 600 lines.
- Before each commit: `npm run validate` and `cargo test`. After a change to
  the content script, the background or the manifest, also run the browser test.
- Code, comments, commits and docs in English. Documents in `docs/` use
  ASD-STE100. `README.md` uses plain language. No em dashes.
- User-facing text goes in all twelve languages (a test checks keys and
  placeholders). The translations are machine-made; mark them for native review
  before a store release.
- No personal data and no secrets in the repository. Test data is invented.
- Never keep a password or a code in storage, a log or a file. A password that
  waits to be saved is kept only sealed to the phone (ADR-0005).
- The private keys are non-extractable WebCrypto keys (ADR-0002). Do not add a
  way to export them.
- The browser test must never reach the real relay or a real phone.

## CI

CI needs the secret `NODKEY_CLI_TOKEN`: a fine-grained token with read access to
`peters/nodkey-cli` contents, for the git dependency.

## Publishing

The repository is private. Do not publish to the Chrome Web Store or
addons.mozilla.org, make the repository public or share a package without the
owner's explicit yes.
