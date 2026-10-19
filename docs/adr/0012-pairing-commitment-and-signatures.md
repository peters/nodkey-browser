# ADR-0012: Pair with the phone's commitment, and sign each request and answer

Status: Accepted.
Date: 2026-10-19.

## Context

Before this decision, the check number was a hash of the four public keys only.
Each side gets the keys of the other side from the relay. A relay that does not
keep to the protocol could select its own keys after it saw the real keys, so
that both screens showed the same number (security review, finding PR-1,
peters/nodkey-cli#16).

The relay also checked the signatures of the relay calls, but the phone and the
extension did not sign the sealed messages. Such a relay could not read a
message, but it could send a request in the name of the extension, or an answer
in the name of the phone (finding PR-3, peters/nodkey-cli#18).

The protocol now has a pairing with a commitment and signed requests and
answers ("Pairing and the check number" and "Signed requests and answers" in
`docs/agent-protocol.md`, peters/nodkey-cli).

## Decision

1. The background opens the pairing grant with `open_grant` (WebAssembly). The
   grant must have the phone's commitment (`commit`). A grant without it comes
   from an app that was made before this change. The background then leaves the
   phone at the relay, keeps nothing, and tells the person: "Update Nodkey on
   your iPhone, then pair again." It never pairs with the number of such an
   app.
2. The background sends one `pairing_check` request with a new nonce of 32
   bytes (`pairing_check_to_sign`). The phone answers with its nonce.
   `finish_pairing` checks the nonce against the commitment and gives the check
   number ("418 902").
3. The popup and the settings page show the number. The background keeps the
   phone only after the person clicks "Same number" within 10 minutes. On
   "Different number", "Cancel", a late click, or a check that does not fit,
   it leaves the phone at the relay and keeps nothing.
4. Each request is signed in WebCrypto. The WebAssembly module makes the
   request and the bytes to sign (`request_to_sign`). The background signs
   them with the non-extractable Ed25519 key (ADR-0002) and gives the signature
   to `seal_signed_request`. A request with a picture carries the SHA-256 of
   the picture, which `request_to_sign` calculates from the same bytes.
5. `open_answer` checks the signature of each answer with the phone's key from
   the pairing. A phone that was paired with the commitment always signs
   (`signs: true` in storage). For a pairing from before, the first signed
   answer sets `signs: true`. From then on, an answer without a valid signature
   is not used: the person sees "Nodkey could not confirm that this answer came
   from your iPhone".

## Consequences

- A relay that swaps keys gets the same number on both screens only by chance,
  one time in a million. It cannot make a request or an answer that the other
  side accepts.
- An iPhone with an app from before this change cannot pair with this version
  of the extension. Pairings that exist stay as they are.
- Tests: `wasm/src/core/tests.rs` (the shared vectors), and
  `tests/unit/agent.integration.test.ts` with the fake phone
  (`PUT /_fake/pairing`: an old app, a nonce that does not fit, answers without
  a signature).
