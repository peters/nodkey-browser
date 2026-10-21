# Architecture decision records

This folder keeps the decisions that control what the Nodkey browser extension
does. Each record uses ASD-STE100 Simplified Technical English (STE).

| Number | Decision | Status |
|---|---|---|
| [ADR-0001](0001-standalone-extension.md) | Make a standalone extension that uses nodkey-proto as WebAssembly | Accepted |
| [ADR-0002](0002-keys-in-webcrypto.md) | Keep the private keys as non-extractable WebCrypto keys | Accepted |
| [ADR-0003](0003-one-code-base-two-browsers.md) | Build Firefox and Chromium from one code base | Accepted |
| [ADR-0004](0004-frontend-stack.md) | Use the company web stack for the pages and plain TypeScript in web pages | Accepted |
| [ADR-0005](0005-save-with-sealed-password.md) | Seal the password of a save at once | Accepted |
| [ADR-0006](0006-tests-in-real-browsers.md) | Test the extension in real browsers on an isolated desktop | Accepted |
| [ADR-0007](0007-passkey-bridge.md) | Answer the passkey requests of pages with passkeys from the phone | Accepted |
| [ADR-0008](0008-safari-mac-app.md) | Carry the extension into Safari with a small Mac app | Accepted (paused) |
| [ADR-0009](0009-card-fill.md) | Fill a payment card only for an amount that the person sees | Accepted |
| [ADR-0010](0010-sign-in-methods.md) | Fill the provider login only on the provider's own pages | Accepted |
| [ADR-0011](0011-fill-only-on-the-account-website.md) | Fill only on the website of the answered account | Accepted |
| [ADR-0012](0012-pairing-commitment-and-signatures.md) | Pair with the phone's commitment, and sign each request and answer | Accepted |
| [ADR-0013](0013-cards-for-later-and-payment-frames.md) | Add a card for later payments, and fill payment frames of other sites | Accepted |
| [ADR-0014](0014-make-a-password-on-the-phone.md) | Make a new password on the phone for a sign-up or a change | Accepted |

## Template

Copy this template to `NNNN-short-name.md`. Use the next free number.

```markdown
# ADR-NNNN: Short title

Status: Proposed | Accepted | Replaced by ADR-NNNN.
Date: YYYY-MM-DD.

## Context

## Decision

## Consequences
```
