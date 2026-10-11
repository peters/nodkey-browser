# Pairing in Firefox

Firefox does not let the test driver open extension pages. Thus you do this
procedure with real input on the isolated desktop: the `horizon-device` tool
(`act` with `click`, `type` and `key`) on the display of the run.

## Preparation

1. Start [the browser run](browser-e2e.md) with `--browser firefox`.
2. Make a device target file for the display of the run in a private folder:
   `{"id":"nodkey-e2e","endpoint":{"kind":"local_x11","display":":<N>"}}`.
3. Run `horizon-device --target <file> doctor`, then `screenshot`.

## Procedure

1. Look at the desktop.

   Result: Firefox shows the Nodkey settings page in a new tab. The extension
   opened it at install. The page starts with "Pair with your iPhone". The name
   field shows "Firefox on Linux". (screenshot)

2. Scroll to "Advanced". Select the text in "Relay address" (click the field,
   then `ctrl+a`). Type the fake relay address from the log
   (`manual_pairing.relay`). Click "Save relay".

   Result: The page shows "Saved.". Do not start the pairing before this step:
   the run blocks the real relay, but a pairing with the wrong relay fails.

3. Scroll to the top. Select the name and type "Firefox test". Click "Get a
   code".

   Result: A 6-character code and "Waiting for your iPhone" show. (screenshot)

4. Wait for the fake phone.

   Result: "Compare the numbers" shows "Test iPhone" and a check number.
   Compare it with `/_fake/check/<agent_id>`. Get the agent id from the
   relay's `/_fake/seen` after the first request, or from the fake relay log.
   (screenshot)

5. Click "Same number".

   Result: The pairing card closes. "Paired iPhone" shows "Test iPhone" with
   its check number.

6. Write the name into the marker file from the log:
   `echo "Firefox test" > <marker>`.

   Result: The run continues with [Fill a login](fill-login.md).
