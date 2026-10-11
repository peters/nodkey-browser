# ADR-0003: Build Firefox and Chromium from one code base

Status: Accepted.
Date: 2026-10-11.

## Context

Firefox and Chromium both support Manifest V3. They are different in the
background: Chromium uses a service worker, and Firefox uses an event page.
Firefox needs an add-on id. Firefox grants host permissions differently.

## Decision

One code base makes both extensions. `scripts/build.mjs` writes
`dist/chromium` and `dist/firefox` with a manifest for each browser. The
background is one ES module. Chromium loads it as a service worker. Firefox
loads it as a background script with `"type": "module"`.

The extension uses the `chrome.*` API with promises. Both browsers supply it.

The background calls a cheap extension API every 20 seconds while it waits for
the phone. Chromium can stop an idle service worker after 30 seconds, and a
request can wait 120 seconds.

## Consequences

- One change goes to both browsers.
- Each release has two packages: `nodkey-chromium-<version>.zip` and
  `nodkey-firefox-<version>.zip`.
- The tests must run in both browsers. See
  [the browser test procedure](../features/browser-e2e.md).
