# Pairing in Chromium

## Preparation

Start [the browser run](browser-e2e.md) with `--browser chromium`.

## Procedure

1. The run opens the popup page in a tab.

   Result: The page shows the Nodkey mark, "Settings" at the top and the card
   "Pair with your iPhone" (Norwegian: "Koble til iPhonen din"). The name field
   shows "Chromium on Linux". (screenshot)

2. The run types the name "Chromium test" and clicks "Get a code".

   Result: The card shows a 6-character code in large type (for example
   `K7P-2QX`), a spinner with "Waiting for your iPhone" and "The code is valid
   for 5 minutes". (screenshot)

3. The fake phone claims the code. The extension sends the pairing check, and
   the fake phone answers with its nonce.

   Result: The card "Compare the numbers" shows "Test iPhone answered." and a
   check number with two groups of 3 digits. The number is the same as the
   number of the fake phone (`/_fake/check/<agent_id>`). The settings page
   does not show the phone yet. (screenshot)

4. The run clicks "Same number".

   Result: The pairing card closes. The popup shows "Open a website to sign in
   with Nodkey."

## Also check

- Click "Different number" instead in step 4. Result: The text says that the
  pairing was not saved and tells you to cancel it on the iPhone too. The
  fake phone's `/_fake/seen` shows no new request.
- Click "Cancel" while the code shows. Result: The first card shows again.
- Set `PUT /_fake/pairing` to `{"old_app": true}` before step 2. Result: After
  the claim, the card says "Update Nodkey on your iPhone, then pair again."
  No check number shows.
- Set `PUT /_fake/pairing` to `{"bad_nonce": true}` before step 2. Result:
  The card says that the pairing did not finish and that nothing was saved.
