# A covered or hidden Nodkey button

This procedure tests that a page cannot make the person click the Nodkey button
when the person cannot see it (issue #9). It also tests that Nodkey adds its
layer to a page only when a field gets the focus.

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.

## Procedure

1. Open `/covered` on the test site. Wait 2 seconds. In the console of the
   page, examine `document.querySelector('nodkey-ui')`.

   Result: The value is `null`. The page cannot see Nodkey yet.

2. Click the e-mail field. Examine `document.querySelector('nodkey-ui')` again.

   Result: The element is there. The Nodkey button shows in the field.

3. Open `/covered?mode=fade`. Click the password field. The page makes the
   layer of Nodkey transparent. Wait 1 second, then click where the Nodkey
   button was.

   Result: Nodkey shows the card "Nodkey did nothing: something on this page
   was over its button. Click the Nodkey button in the toolbar instead." The
   password field stays empty. `/_fake/seen` has no new request. (screenshot)

4. Chromium only: open `/covered?mode=cover`. Click the password field. The
   page puts a yellow box with "Free gift" over the Nodkey button. Clicks go
   through the box. Wait 1 second, then click the box.

   Result: The same card as in step 3 shows. `/_fake/seen` has no new request.
   (screenshot)

5. Open `/covered` again, without a mode. Click the password field and, after
   1 second, the Nodkey button.

   Result: Nodkey fills the login as in [Fill a login](fill-login.md). Thus
   the clicks in steps 3 and 4 were on the button.

## Notes

- The button takes a click only after it was in place for 0.25 seconds. A
  button that moves (scroll, a change of the page) starts the time again.
- Firefox cannot tell when an element of the page covers the button but lets
  clicks through (step 4). There, the extension examines the styles of its
  layer and the element at the position of the click.
- The browser test does steps 1 to 5 (`tests/e2e/covered.mjs`).
