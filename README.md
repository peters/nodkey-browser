<p align="center">
  <img src="public/icons/logo.svg" width="96" height="96" alt="Nodkey logo">
</p>

<h1 align="center">Nodkey for Firefox and Chromium</h1>

<p align="center">
  Sign in with logins, two-step codes and passkeys from your iPhone.<br>
  You approve every request with Face ID.
</p>

<p align="center">
  <a href="https://github.com/peters/nodkey-browser/actions/workflows/ci.yml"><img src="https://github.com/peters/nodkey-browser/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://apps.apple.com/app/id6820952672"><img src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us?size=250x83" height="44" alt="Download Nodkey on the App Store"></a>
</p>

The Nodkey extension signs you in with logins and one-time codes from
[Nodkey](https://kh-labs.dev/nodkey/) on your iPhone. Every request shows up on
your phone, and nothing leaves it until you approve with Face ID.

## What it does

- **Fill a login.** Click the Nodkey button in a sign-in field, or Fill login in
  the toolbar popup. Approve on your iPhone. The extension fills the user name
  and the password.
- **Fill a code.** The same in a two-step code field, also when the page has one
  box per digit.
- **Use passkeys.** When a website asks for a passkey, Nodkey asks your iPhone.
  You approve with Face ID and the iPhone signs. The passkey never leaves your
  iPhone. Turn this off in the settings to use the passkeys of the browser.
- **See what you approve.** The notification on your iPhone can show a picture
  of the page. It is encrypted so that only your iPhone can see it.
- **Save new passwords.** When you sign up or change a password, the extension
  offers to save it in Nodkey. The password is locked for your iPhone at once:
  the extension never keeps it in readable form.

## How it works

The extension is an agent, like the `nodkey` command line. It pairs once with
your iPhone and shows there with its own name, for example "Firefox on Linux".
Requests go through the Nodkey relay, encrypted end to end. The relay sees no
site, user name, password or code.

The extension's private keys are browser keys that cannot be copied out. The
protocol code is the same Rust code the `nodkey` command line uses, compiled to
WebAssembly.

## What you need

- An iPhone with iOS 18 or later and [Nodkey](https://apps.apple.com/app/id6820952672)
  from the App Store (free).
- Chromium 137 or later (or a browser built on it), or Firefox 130 or later.

The extension is not in the Chrome Web Store or on addons.mozilla.org yet. Until
then, build it from source (below) and load it unpacked.

## Build

You need Node 24.21 (`.nvmrc`), Rust with the `wasm32-unknown-unknown` target and
`wasm-bindgen-cli` (the version in `Cargo.lock`).

```sh
npm ci
npm run validate
```

This makes `dist/chromium` and `dist/firefox`. Load them as unpacked extensions:

- Chromium: `chrome://extensions`, turn on Developer mode, Load unpacked, pick
  `dist/chromium`.
- Firefox: `about:debugging`, This Firefox, Load Temporary Add-on, pick
  `dist/firefox/manifest.json`.

## Security

The design decisions are in [docs/adr](docs/adr/README.md). To report a security
problem, see [SECURITY.md](SECURITY.md).

## Related

- [nodkey](https://github.com/peters/nodkey-cli): the command line and MCP
  server for coding agents. It holds the protocol
  ([docs/agent-protocol.md](https://github.com/peters/nodkey-cli/blob/main/docs/agent-protocol.md)).
- [kh-labs.dev/nodkey](https://kh-labs.dev/nodkey/): the app's website.

## License

[MIT](LICENSE)
