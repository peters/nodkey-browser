# Nodkey browser extension: agent rules

## Self-review and PR review

- The implementing agent reviews the complete diff once, fixes its findings, and runs the applicable checks before the first push.
- After that, rely on the upstream repository's automatic PR review. Address its feedback and validate the affected changes without another full self-review round.
- Never assign, request, or re-request Copilot, Claude, or another automated reviewer. Do not use reviewer assignments, labels, comments, CLI commands, APIs, workflow dispatches, or PR state changes to trigger a review. The upstream repository manages automatic review.
- Do not start a separate local review agent or a CLI review loop. This rule also applies to external contributions and overrides review loops in skills or linked procedures.
- Keep CI, applicable smoke checks, feedback handling, and merge authorization. Check which commit a review covers; do not claim that an earlier review covers later changes. If a required automatic review is missing or fails, report the blocker without requesting another review.
- Keep `CLAUDE.md` as the single import `@AGENTS.md`. Put repository instructions in `AGENTS.md`.

The Nodkey extension for Firefox and Chromium (Safari is paused, ADR-0008). It asks Nodkey on the person's
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
- `store/`: the store texts (`listing/<lang>.json`) and images (`scenes.html`) for AMO and the
  Chrome Web Store; `scripts/store.mjs` renders them into `store/out/` (docs/publishing/store-material.md).
- `safari/`: the Mac app that carries the extension into Safari (xcodegen, ADR-0008).
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
| `npm run build` | `dist/chromium`, `dist/firefox` and a zip of each; `dist/safari` for the Mac app |
| `npm run store` | Check the store texts and render the store images into `store/out/` |
| `NODKEY_MAC_HOST=<ssh host> scripts/safari.sh` | Build, sign and install the Safari Mac app on the Mac build host (after `npm run build`) |
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

## Companion repositories

Nodkey has three parts: the iPhone app and relay (`peters/nodkey`), the command line, MCP server
and protocol (`peters/nodkey-cli`), and this extension. When the app gets a feature that agents or
browsers can see (a request kind, how accounts match, saves, passkeys, cards), check whether the
extension needs it, and keep the store texts and the data disclosures true
(docs/publishing/store-material.md).

## Publishing

The repository is public. Do not publish to the Chrome Web Store or
addons.mozilla.org or share a package without the owner's explicit yes.

Version numbers (the owner's decision, 2026-10-21): the iPhone app (peters/nodkey), nodkey-cli and the browser
extension (peters/nodkey-browser) share MAJOR.MINOR. Version 1.4.x of each belongs together: the same features and
protocol. The PATCH number is per repository: a fix in one part becomes X.Y.(Z+1) there only. A feature release
raises MINOR in all three at the same time and goes out together with, or after, the App Store version. A CLI or
extension X.Y needs the iPhone app X.Y or later (an older app answers `unsupported_kind`). The switch: nodkey-cli
0.4.1 is the last 0.x; the next CLI and extension releases are 1.4.0, together with the app's 1.4.

The steps for each store are in [docs/publishing](docs/publishing/README.md)
(ASD-STE100). Use the `horizon:horizon-browser` skill for the store pages when
it is available, and the `nodkey` skill for the logins.

## Pull requests

The upstream repository starts PR review automatically. The agent does not select a reviewer or start another review. Read the review and its threads, fix valid findings, answer invalid findings with evidence, and run the affected checks. Keep the repository's required review decision, unresolved-feedback rules, CI, acceptance checks and merge authorization. Check the reviewed commit before using a review as evidence. A missing or failed required review is a blocker to report, not a reason to assign a reviewer or trigger another run.
