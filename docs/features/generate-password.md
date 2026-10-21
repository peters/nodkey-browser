# Make a strong password

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.

## Procedure

1. Open `/join` on the test site. Type a new user name, for example
   `new-chromium@example.com`. Click "Next".

   Result: The page "Create a strong password" shows a password field and a
   "Confirm" field.

2. Click in the password field.

   Result: The Nodkey button shows inside the right edge of the field. Its
   label is "Make a strong password with Nodkey".

3. Click the Nodkey button.

   Result: A menu shows below the button with two choices: "Make a strong
   password" (with "Your iPhone makes it and saves it first") and "Use a saved
   login". The first choice has the focus. (screenshot)

4. Click "Make a strong password".

   Result: The card shows "Approve the new password on your iPhone".

5. The fake phone approves.

   Result: The password field and the "Confirm" field show the same filled
   password. The card shows "Saved in Nodkey. The new password is filled in."
   (screenshot)

6. Look at `/_fake/seen` of the fake relay.

   Result: The last request has `kind: generate`, the target `localhost`,
   `generate.username` is the user name of step 1, and `generate.rules` has the
   `passwordrules`, `min_length: 12` and `max_length: 40` of the page.

7. Click "Next".

   Result: The page goes to "Welcome". No save question shows, because the
   phone saved the password already.

## Also check

- Open `/change`. Click in "New password", click the Nodkey button, then "Make
  a strong password". Result: "New password" and "Confirm new password" get the
  same password. The request has `generate.change: true` and the user name
  `alex@example.com` from the hidden user name field. The card says that the
  iPhone keeps the old password for 30 days.
- On `/change`, click in "Current password". Result: The usual button "Fill
  with Nodkey" shows, without a menu.
- On `/join/password`, open the menu with the keyboard (focus the button, push
  Enter). Push the down arrow, then Enter. Result: "Use a saved login" sends a
  usual login request.
- On the menu, push Escape. Result: The menu closes and the field has the
  focus again.
- On `/login`, click in the password field and click the Nodkey button.
  Result: No menu. The login is filled as in [Fill a login](fill-login.md).
- Set the fake phone mode to `deny`. Make a password. Result: The card shows
  "No password was made. You said no on your iPhone."
- The fake phone refuses with `no_passcode`, `not_allowed` and `save_failed`
  (see the unit test `tests/unit/generate.integration.test.ts`). Result: The
  card shows a calm text for each one, and nothing is filled.
- A field with rules that no password can meet (for example `minlength="40"
  maxlength="8"`). Result: The card says at once that Nodkey cannot make a
  password for these rules. No request goes to the phone.
