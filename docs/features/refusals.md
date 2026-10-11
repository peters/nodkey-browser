# Refusals

## Preparation

The browser is paired with the fake phone. Set the mode of the fake phone with
`curl -X PUT -H 'content-type: application/json' -d '"<mode>"'
<relay>/_fake/mode`.

## Procedure

1. Set the mode to `deny`. Fill a login on `/login`.

   Result: The card shows "You denied the request on your iPhone." The fields
   stay empty. (screenshot)

2. Set the mode to `silent`. Fill a login.

   Result: The card shows "Approve on your iPhone" for two minutes, then "Your
   iPhone did not answer in time."

3. Set the mode to `silent`. Submit a new login on `/signup` and click "Save".

   Result: After two minutes the card says that the login waits, locked so
   that only the iPhone can read it. The popup shows it under "Waiting to be
   saved" with "Send again" and "Discard". (screenshot)

4. Set the mode to `approve`. Click "Send again" in the popup.

   Result: The save goes through. The entry goes away from the popup.

5. Set the mode to `gone`. Fill a login.

   Result: The card shows "Your iPhone did not answer in time." at once.

6. Stop the fake relay. Fill a login.

   Result: The card shows "Nodkey cannot reach the relay. Check your connection
   and try again."
