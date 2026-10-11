# Nodkey for Firefox and Chromium

The Nodkey extension signs you in with logins and one-time codes from
[Nodkey](https://kh-labs.dev/nodkey/) on your iPhone. Every request shows up on
your phone, and nothing leaves it until you approve with Face ID.

- **Fill a login.** Click the Nodkey button in a sign-in field, or Fill login in
  the toolbar popup. Approve on your iPhone. The extension fills the user name
  and the password.
- **Fill a code.** The same in a two-step code field, also when the page has one
  box per digit.
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

Needs Chromium 137 or Firefox 130 or later.

## License

MIT
