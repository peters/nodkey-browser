# Fill a login

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.

## Procedure

1. Open `/login` on the test site.

   Result: The page shows the yellow banner "Nodkey test site: synthetic data
   only", an e-mail field and a password field.

2. Click in the password field.

   Result: A small Nodkey button (the key mark on a green tile) shows inside
   the right edge of the field. (screenshot)

3. Click the Nodkey button.

   Result: A card shows at the top right: "Approve on your iPhone" with a
   spinner and "The request waits up to two minutes."

4. The fake phone approves.

   Result: The e-mail field shows `alex@example.com`. The password field shows
   a filled password. The card shows "Filled the login for localhost." and
   closes after 8 seconds. (screenshot)

## Also check

- Click in the e-mail field. Result: The Nodkey button shows there too, and it
  fills the same login.
- The fake relay (`/_fake/seen`) has a picture for the request: the
  `attachment` has bytes. The screenshot of the page went to the phone.
- In the popup of this tab, "Fill login" gives the same result.
- Open `/login` again. Type `alex@example.com` in the e-mail field, then click
  the Nodkey button in the password field. Result: the request in
  `/_fake/seen` has the target `localhost/alex@example.com`. The phone uses
  that account and does not ask which account to use. A user name that the
  browser filled in gives the same result.
- On the code page after a sign-in on the same site (in 5 minutes), the code
  request has the target `<site>/<user name of the sign-in>`.
