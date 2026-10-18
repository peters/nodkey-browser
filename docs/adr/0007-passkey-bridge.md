# ADR-0007: Answer the passkey requests of pages with passkeys from the phone

Status: Accepted.
Date: 2026-10-13.

## Context

Websites ask for passkeys with `navigator.credentials.get` and
`navigator.credentials.create` (WebAuthn). Nodkey keeps passkeys on the iPhone.
The private key never leaves the phone, and the phone does not use Bluetooth
(hybrid transport). The protocol has a request kind `passkey` for this
(`docs/agent-protocol.md` in `peters/nodkey-cli`, contract in issue
`peters/nodkey#50`).

The phone signs over `clientDataJSON`, and `clientDataJSON` contains the origin
of the page. A page that can choose the origin can get a signature for another
website. Thus the page must not choose the origin.

## Decision

1. A page script in the main world of the page replaces
   `navigator.credentials.get` and `create`, but only for `publicKey` requests.
   Other requests go to the browser. The page script also makes
   `isUserVerifyingPlatformAuthenticatorAvailable()` resolve `true` and
   `isConditionalMediationAvailable()` resolve `false`.
2. A bridge content script carries each call to the background on a port with
   the name `passkey`. When the port closes (the page aborts or goes away), the
   background stops the wait for the phone.
3. The background gets the origin from `sender.origin` (or `sender.url`). It
   never uses an origin from the page. It builds `clientDataJSON` itself:
   `{"type","challenge","origin","crossOrigin":false}`.
4. The background refuses with `SecurityError`:
   - a page that does not use HTTPS (`http://localhost` is the exception),
   - an IP address as the host,
   - a frame that is not the top frame, unless the frame and all its
     ancestors have the origin of the top frame,
   - an `rpId` that is not the host or a parent domain of the host, or that
     has no dot (`localhost` is the exception).
5. A conditional request (`mediation: "conditional"`) never goes to the phone.
   It waits until the page aborts it. Thus a page load cannot send a request
   to the phone. A silent request is refused.
6. Nodkey makes ES256 (-7) passkeys only. A `create` call without -7 gets
   `NotSupportedError` at once.
7. The background examines the answer of the phone: the `rpIdHash` in the
   authenticator data must be the SHA-256 of the `rpId`, the user presence flag
   must be set, and a new passkey must have the credential id of the answer.
8. The page gets objects that inherit from `PublicKeyCredential`,
   `AuthenticatorAssertionResponse` and `AuthenticatorAttestationResponse`,
   with all the values and methods of WebAuthn (`toJSON()` too).
   `authenticatorAttachment` is `platform`, the transports are `hybrid` and
   `internal`.
9. The background registers the page script and the bridge with
   `chrome.scripting` only while the setting "Use passkeys from Nodkey" is on
   and a phone is paired. When the setting is off, no passkey script runs in
   pages.
10. PRF (added 2026-10-18, peters/nodkey-browser#7): the page script gives
    `extensions.prf` to the background, with each BufferSource in base64url.
    The background applies the rules of WebAuthn before it asks the phone:
    `evalByCredential` is not allowed on create and needs a non-empty
    `allowCredentials` on get (`NotSupportedError`), and each of its keys must
    be in `allowCredentials` (`SyntaxError`). A get with `prf: {}` and no
    inputs sends no `prf`. The page gets `getClientExtensionResults().prf`
    (`enabled` on create, `results` as ArrayBuffers) and the same values in
    base64url in `toJSON()`. When the phone answers `prf_unsupported` (a
    passkey from before PRF), the background asks again without PRF, so the
    page gets a sign-in without `results`, as a browser does with an
    authenticator without PRF. The person approves two times. A PRF answer
    with a lease other than `once` is refused. The outputs are secret keys: the
    extension does not keep or log them.

## Consequences

- The extension needs the `scripting` permission.
- The phone examines `clientDataJSON` again before it asks the person. Thus a
  damaged extension cannot get a signature for another origin from the phone.
- WebAuthn errors: `denied`, `expired` and other refusals give
  `NotAllowedError`. `excluded` gives `InvalidStateError`.
- The relay has no way to cancel a request. When the page aborts, the phone
  can still show the request. The extension ignores a late answer.
- The bridge has no public suffix list. An `rpId` such as `co.uk` passes the
  extension. The passkey is then only usable on that `rpId`, and the phone
  shows the origin.
- While the setting is on, the passkeys of the browser and of other
  extensions do not get the `publicKey` requests of pages.
