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
   6. Opens `/passkey` and does [Passkeys](passkeys.md): a conditional request
      that must not reach the phone, Create a passkey and Sign in with a
      passkey. The server of the test site examines the passkey and the ES256
      signature. In Chromium, the script then turns the passkey setting off and
      makes sure that the page has the passkeys of the browser again.

   Result: The log shows `all flows passed`.

4. Stop the recording and keep the file as private evidence. Close the panel.
   Stop the run with Ctrl-C.

   Result: The script stops the browsers, the fake relay, the site and the
   desktop.

## Notes

- `--passkeys-only` pairs and then does only step 6.

- Chromium runs in Norwegian (`--lang=nb`) and Firefox in English. Thus the run
  shows two of the twelve languages.
- The script refuses to continue when the relay setting is not the fake relay.
- Snap Chromium can only read files under `~/snap/chromium`. The script copies
  the extension there and deletes the copy at the end.
