# ADR-0002: Keep the private keys as non-extractable WebCrypto keys

Status: Accepted.
Date: 2026-10-11.

## Context

The extension has two private keys: an Ed25519 key to sign relay calls and an
X25519 key to open what the phone seals to the extension. A person who can read
these keys can send requests to the phone as this browser. The person must
still approve each request on the phone.

Extension storage (`chrome.storage`) keeps values as readable data. Any code in
the extension can read a key from there.

## Decision

The extension makes both keys with WebCrypto and sets `extractable` to false.
It keeps the `CryptoKey` objects in IndexedDB. No code can read the private key
bytes.

The extension signs relay calls with `crypto.subtle.sign`. To open a sealed
message, it calculates the X25519 shared secret with
`crypto.subtle.deriveBits`. The WebAssembly module does the remaining steps of
HPKE (`nodkey_proto::dh::open_with_dh`). The tests in `peters/nodkey-cli` check
that this gives the same result as an open with the private key, for each HPKE
test vector.

## Consequences

- The extension needs Ed25519 and X25519 in WebCrypto: Chromium 137 or later,
  Firefox 140 or later (Firefox needs 140 for `data_collection_permissions`).
- The keys stay in the browser profile. Another browser or profile must pair
  again.
- A backup of the browser profile does not contain usable key bytes.
