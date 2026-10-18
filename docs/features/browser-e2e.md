# Browser test: pair, fill and save in real browsers

This procedure tests the built extension in real Chromium and Firefox. It uses
an isolated desktop, the fake relay and phone from `peters/nodkey-cli` and a
synthetic test site. It does not use the real relay or a real phone.

## Prerequisites

- Linux with Xvfb, Openbox, x11vnc, Chromium and Firefox. When x11vnc is not
  installed, set `NODKEY_E2E_TOOLS` to an unpacked tools root that contains
  `usr/bin/x11vnc` and its libraries.
- `npm run build` and `cargo build -p fake-relay` are done.
- For live viewing: an agent in Horizon with the `device_panel` tool.

## Procedure

1. Start the run. Use `--keep` to keep the browsers open after the flow.

   ```sh
   NODKEY_E2E_START_DELAY=12000 npm run e2e -- --keep
   ```

   Result: The script prints `{"vnc_address":"127.0.0.1:<port>"}`.

2. Create a Horizon VNC Device panel with that address before the delay ends
   (`device_panel`, `operation: create`). Start a video recording of the panel.

   Result: The panel shows the isolated desktop.

3. Monitor the log. For each browser, the script does these steps:

   1. Opens the popup in a tab, types a name and pairs. It compares the check
      number with the number of the fake phone.
   2. Opens `/login`, clicks the Nodkey button in the password field and waits
      for the user name and the password.
   3. Opens `/otp` and fills the code `190274` into one field.
   4. Opens `/boxes` and fills the code into six boxes. The Nodkey button is to
      the right of the last box.
   5. Opens `/signup`, types a new user name and password and submits. Then it
      answers Save in the save question with the Enter key. The fake phone
      opens the sealed password, and the script compares it.
   6. Does [Sign-in methods](sign-in-methods.md): "Sign in with Google" on
      `/federated`, the Google login on the stand-in Google pages, the Nodkey
      button at "Check your phone" and the question to remember the method on
      `/learn`. Then [Codes sent by SMS](sms-code.md) on `/sms` and
      [The agent limit](agent-limit.md) on `/login`. In Chromium, the script
      also reads the activity of the tab (the text of the card and the popup).
   7. Opens `/checkout` and does [Pay with a card](fill-card.md): it fills the
      test card for the total of 499,00 kr, makes sure that the fake phone saw
      the amount, the total and the origin, raises the total and waits for the
      empty card fields. Then it types a second test card, pays and saves the
      card. The fake phone opens the sealed card number, and the script
      compares it.
   8. Opens `/passkey` and does [Passkeys](passkeys.md): a conditional request
      that must not reach the phone, Create a passkey and Sign in with a
      passkey, then the same with PRF. The server of the test site examines
      the passkey, the ES256 signature and the PRF output. In Chromium, the script then turns the passkey setting off and
      makes sure that the page has the passkeys of the browser again.

   Result: The log shows `all flows passed`.

4. Stop the recording and keep the file as private evidence. Close the panel.
   Stop the run with Ctrl-C.

   Result: The script stops the browsers, the fake relay, the site and the
   desktop.

## Notes

- `--passkeys-only` pairs and then does only step 8. `--cards-only` pairs and
  then does only step 7. `--signin-only` pairs and then does only step 6.
- The run starts a stand-in for Google's sign-in pages on
  `https://accounts.google.com:<port>`, with a certificate that `openssl`
  makes for the run. The browsers resolve `accounts.google.com` to this
  computer and accept that certificate. Nothing goes to Google.
- Snap Firefox (`/usr/bin/firefox` on Ubuntu) cannot open the display of the
  isolated desktop ("cannot open display"). Then install Firefox for the test
  with `npx @puppeteer/browsers install firefox@stable --path ~/.cache/<folder>`
  and set `NODKEY_E2E_FIREFOX` to its `firefox` file.

- Chromium runs in Norwegian (`--lang=nb`) and Firefox in English. Thus the run
  shows two of the twelve languages.
- The script refuses to continue when the relay setting is not the fake relay.
- Snap Chromium can only read files under `~/snap/chromium`. The script copies
  the extension there and deletes the copy at the end.
