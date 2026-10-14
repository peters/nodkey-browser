# ADR-0008: Carry the extension into Safari with a small Mac app

Status: Accepted. Work on Safari is paused (see Consequences).
Date: 2026-10-14.

## Context

Safari on macOS loads a web extension only from a signed Mac app. The app has
an app extension of type `com.apple.Safari.web-extension`, and the files of the
web extension are in the resources of that app extension. There is no other
way to install a web extension in Safari.

Safari supports Manifest V3, a module service worker, WebCrypto Ed25519 and
X25519, and WebAssembly. Safari grants access to websites in its own settings.
`permissions.request` does not show a prompt in Safari.

## Decision

1. `scripts/build.mjs` also writes `dist/safari`. The manifest is the
   Chromium manifest (a module service worker) with
   `browser_specific_settings.safari.strict_min_version` 18.0. Safari gets no
   zip.
2. `safari/` holds the Mac app as an xcodegen project: the app
   `com.fintermac.nodkey.safari` and its app extension
   `com.fintermac.nodkey.safari.extension`. A build phase copies `dist/safari`
   into the app extension. The app shows if Nodkey is on in Safari, three
   steps to turn it on, and a button that opens the Safari settings. Its text
   is in the twelve languages.
3. The extension stays standalone (ADR-0001). The handler for native messages
   answers `unsupported`.
4. `scripts/safari.sh` builds, signs and installs the app on the Mac build
   host. It always makes a clean build: the copied web extension must be in a
   new signature.
5. In Safari, the settings page tells the person how to give access to
   websites in the Safari settings. It does not show the button that calls
   `permissions.request`.
6. The user agent of Safari gives the default name "Safari on macOS".

## Consequences

- Safari loads the extension and the settings page works (tested on macOS
  27.0.1 with Safari 27.0.1 on 2026-10-14). Fill, save and passkeys are not
  tested in Safari yet.
- The owner paused the work on Safari on 2026-10-14. Safari keeps its
  passwords in iCloud Keychain, and the Nodkey app can already move them in
  from Apple Passwords on the iPhone.
- A release in the Mac App Store needs an App Store Connect record. The
  bundle id is open: a universal purchase with the iPhone app needs
  `com.fintermac.nodkey` for the Mac app.
- A test in Safari needs the screen of the Mac. The test cannot use an
  isolated desktop as in ADR-0006.
