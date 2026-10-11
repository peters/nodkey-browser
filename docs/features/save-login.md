# Save a new login

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.
"Offer to save new passwords" is on (the default).

## Procedure

1. Open `/signup`. Type a new e-mail address, a new password and the same
   password again. Click "Create account".

   Result: The page goes to "Welcome".

2. Look at the top right of the page.

   Result: The card "Save the login for localhost in Nodkey?" shows the e-mail
   address and the buttons "Save", "Not now" and "Never for this site". "Save"
   has the focus. (screenshot)

3. Push Enter.

   Result: The card shows "Confirm on your iPhone", then "Saved in Nodkey on
   your iPhone." (screenshot)

4. Look at `/_fake/seen` of the fake relay.

   Result: The last request has `kind: save`, the e-mail address as
   `save.username`, and `saved_password` is the password you typed. The fake
   phone opened the password that the extension sealed to it.

## Also check

- Click "Not now". Result: Nothing is sent. The next sign-in on the site gets
  the question again.
- Click "Never for this site". Result: The site shows in the settings under
  "Never offer to save for". No question shows for that site.
- Fill a login with Nodkey and submit it. Result: No save question shows,
  because Nodkey filled that login.
- Sign in with two steps (user name page, then password page). Result: The
  question shows the user name from the first page.
