# Sign-in methods

This procedure tests "Sign in with Google" ([ADR-0010](../adr/0010-sign-in-methods.md)):
the method card, the Google login on the Google page only, the Nodkey button at
"Check your phone", and the question "Remember that ... uses Google sign-in?".

## Preparation

1. The browser is paired with the fake phone. The fake phone mode is
   `approve`.
2. The run starts a stand-in for Google's sign-in pages on
   `https://accounts.google.com:<port>` with a certificate made for the run.
   The browsers resolve `accounts.google.com` to this computer
   (`--host-resolver-rules` in Chromium, `network.dns.localDomains` in
   Firefox) and accept the certificate (`acceptInsecureCerts`). Nothing goes to
   Google.
3. Tell the fake phone that `localhost` signs in only with Google:

   ```sh
   curl -X PUT -H 'content-type: application/json' \
     -d '{"localhost":{"kind":"federated","provider":"google","certainty":"confirmed"}}' \
     <relay>/_fake/methods
   ```

## Procedure

1. Open `/federated` on the test site. Click the Nodkey button in the e-mail
   field.

   Result: The fake phone gets a login request for `localhost`. A card shows:
   "You sign in to localhost with Google. Click the Google button on the
   page. Nodkey fills your Google login only on the sign-in page of Google."
   The card has the button "Sign in with Google", and it has the focus. The
   e-mail field stays empty. (screenshot)

2. Push Enter.

   Result: The page of the test site presses its "Sign in with Google" link.
   The browser opens `accounts.google.com`. A card shows "Nodkey has your
   Google login alex.example@gmail.example for localhost. Click the Nodkey
   button in the field to fill it." (screenshot)

3. Click the Nodkey button in "Email or phone". Click "Next". Click the Nodkey
   button in the password field. Click "Next".

   Result: Nodkey fills the Google user name, then the Google password. The
   fake phone gets no new request. No save question shows.

4. Look at "Check your phone".

   Result: A Nodkey button shows to the right of "Try another way". (screenshot)

5. Click the Nodkey button.

   Result: The page shows its other ways. Nodkey clicks "Get a verification
   code from the Google Authenticator app". The code page opens, and Nodkey
   fills `190274`.

6. Click "Next".

   Result: The test site shows "Signed in with Google as
   alex.example@gmail.example".

7. Remove the methods of the fake phone (`-d '{}'` to `/_fake/methods`). Open
   `http://127.0.0.1:<port>/learn`. Click "Continue with Google". On the
   Google page, click the account.

   Result: The test site shows "Welcome". A question shows: "Remember that
   127.0.0.1 uses Google sign-in?", with "Your iPhone gets only the site and
   the name of the provider, encrypted.", and "Remember", "Not now" and
   "Never for this site". (screenshot)

8. Click "Remember".

   Result: The card shows "Your iPhone has the suggestion. Accept it in the
   Nodkey app." `/_fake/suggestions` has the target `127.0.0.1` and the
   method `federated`, `google`, `seen`, `extension`, with the outcome
   `signed_in`. The request has no password and no user name.

## Also check

- Do step 7 again and click "Never for this site". Do step 7 again. Result: No
  question shows.
- Do step 7 on `/federated` (the phone knows Google for `localhost`). Result:
  No question shows.
- Send 6 suggestions in one hour. Result: The card shows "Your iPhone did not
  take the suggestion now. You can try again later."
