# ADR-0006: Test the extension in real browsers on an isolated desktop

Status: Accepted.
Date: 2026-10-11.

## Context

Unit tests with jsdom do not prove that an extension works. The browsers load
extensions, grant permissions and run service workers differently. The fill
must work in real pages, and the text must be correct in each browser.

The tests must not use the developer's own desktop, browser profiles or the
real relay and phone.

## Decision

`tests/e2e/run.mjs` starts an isolated X11 desktop (Xvfb, Openbox and a
view-only x11vnc on loopback). It starts the fake relay and phone from
`peters/nodkey-cli` (`nodkey-fake-relay`) and a synthetic test site. It runs
Chromium and Firefox with private profiles and the built extension, and
controls them with Puppeteer.

The flow is the same in both browsers: pair and compare the check number,
fill a login, fill a code in one field, fill a code in six boxes, and save a
new login. The fake phone opens the sealed password and the test compares it.

A person watches the run live in a Horizon VNC Device panel. The agent records
the panel as video evidence.

Each visual test is a procedure in `docs/features/` (index:
[docs/features/README.md](../features/README.md)). A procedure tells the
preparation, the steps, the result to see and the evidence to keep. Firefox
does not let the driver open extension pages, so the pairing in Firefox is a
procedure with real input through `horizon-device`. The other procedures that
the run does not do automatically are done by hand on the same desktop.

## Consequences

- The tests need Xvfb, Openbox, x11vnc, Chromium and Firefox on Linux.
- The tests do not touch the real relay or a real phone. A test with the real
  phone is a separate manual step.
- `npm run e2e` is not part of `npm run validate`, because it needs a desktop.
