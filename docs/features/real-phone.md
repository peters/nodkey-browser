# Real phone

This procedure sends a request to the owner's iPhone. Do it only when the owner
is ready and agrees. Use the owner's real relay. Do not use real accounts in a
recording that leaves the owner's computer.

## Procedure

1. Load `dist/chromium` or `dist/firefox` in a normal browser profile of the
   owner. Keep the default relay.

2. Pair from the popup. The owner types the code in Nodkey under Agents, Add
   agent.

   Result: The iPhone shows the browser's name and the same check number as
   the popup.

3. Open a sign-in page of a site that the owner has in Nodkey. Click the Nodkey
   button.

   Result: The iPhone shows a notification with the site, the reason "Sign in
   to <site> in <browser>" and a picture of the page. After Face ID, the
   extension fills the login.

4. Sign up or change a password on a test account and click "Save".

   Result: The iPhone asks to save the login (this needs the `save` support in
   the app). After Face ID, the login is in Nodkey.

5. Remove the browser under Agents on the iPhone.

   Result: The next request from the browser says "Your iPhone does not know
   this browser any more. Pair again."
