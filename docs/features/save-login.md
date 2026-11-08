# Save a new login

## What the question needs

The question shows only after a real submit of the form. It does not show for a
login that Nodkey filled, that the phone saved or that the person said "Not
now" to. The browser keeps a keyed fingerprint of such a login for 180 days,
never the password, and it asks again when the password changes (ADR-0015).

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
  because Nodkey filled that login. Stop the background first (wait 30 seconds
  in Chromium) and submit again. Result: Still no question.
- Type the login again after "Not now" and submit it. Result: No question.
  Change one character of the password and submit it. Result: The question
  shows again.
- Click a custom select, a menu or the button that shows the password. Result:
  No save question shows, because such a click is not a submit.
- Sign in with two steps (user name page, then password page). Result: The
  question shows the user name from the first page.
- Make a password with Nodkey ([Make a strong password](generate-password.md))
  and submit the form. Result: No save question shows, because the phone saved
  that password already.
