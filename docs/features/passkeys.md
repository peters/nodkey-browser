# Passkeys

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.
The setting "Use passkeys from Nodkey" is on (the default). The fake phone
makes ES256 passkeys and signs as the app does.

## Procedure

1. Open `/passkey` on the test site.

   Result: The page shows an e-mail field, "Create a passkey", "Sign in with a
   passkey" and the status "Ready".

2. In the console of the page, start a conditional request
   (`mediation: "conditional"`) and abort it after one second.

   Result: `isConditionalMediationAvailable()` is `false`. The request stops
   with `AbortError`. The fake relay (`/_fake/seen`) has no passkey request.

3. Click "Create a passkey".

   Result: A card shows at the top right: "Approve on your iPhone". Then the
   status shows "Registered" and the user name. The card shows "Saved a new
   passkey for localhost in Nodkey." (screenshot)

4. Click "Sign in with a passkey".

   Result: The status shows "Signed in as" and the user name. The server of the
   test site examined `clientDataJSON`, the authenticator data and the ES256
   signature with the public key from step 3. (screenshot)

5. Examine the passkey requests in `/_fake/seen`.

   Result: The `origin` in each `client_data_json` is the origin of the test
   site.

6. Click "Create a passkey with PRF".

   Result: The page asks for a new passkey with `extensions.prf` and an input.
   The status shows "PRF enabled for" and the user name. The server of the test
   site examined the PRF output: it is HMAC-SHA256 of the fixed `credRandom` of
   the fake phone (the nodkey-proto vectors) and the salt of the input.

7. Click "Unlock with PRF".

   Result: The status shows "PRF key for" and the user name. The output is the
   same as in step 6. The request in `/_fake/seen` has `prf.eval.first`.

8. In the settings page, turn off "Use passkeys from Nodkey". Load `/passkey`
   again.

   Result: `navigator.credentials.get` is the function of the browser
   (`[native code]`). Create a passkey goes to the browser, not to the phone.

## Also check

- Click "Create a passkey" again with the same user name. Result: The phone
  refuses (`excluded`) and the status shows `InvalidStateError`.
- A passkey from before PRF: `tests/unit/passkey.integration.test.ts` asks
  for a PRF output from the test passkey of the fake phone for `webauthn.io`.
  Result: The phone answers `prf_unsupported`. Nodkey asks again without PRF,
  and the page gets a sign-in with `prf: {}` (no results).
- Set the fake phone mode to `deny` and sign in. Result: The status shows
  `NotAllowedError`. The card shows "You denied the request on your iPhone."
