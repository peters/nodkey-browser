# Settings page

## Preparation

The browser is paired with the fake phone. Open the settings page (the popup,
"Settings").

## Procedure

1. Look at the page.

   Result: The page shows the title "Nodkey settings" and the groups "This
   browser", "Paired iPhone", "Requests", "Saving" and "Advanced". (screenshot)

2. Change the name and click "Save name".

   Result: "Saved." shows. The help text says that the new name shows on the
   iPhone at the next pairing.

3. Turn off "Show a picture of the page in the notification". Fill a login.

   Result: The request in `/_fake/seen` has no attachment.

4. Turn off "Offer to save new passwords". Submit a new login.

   Result: No save question shows.

5. Remove a site from "Never offer to save for".

   Result: The site goes away from the list.

6. Type an address without HTTPS on the internet as the relay and click "Save
   relay".

   Result: The page shows the relay help text in red, and the relay does not
   change.

7. Click "Unpair".

   Result: "Paired iPhone" shows "Not paired yet". The fake relay received
   `DELETE /v1/agents/<agent_id>/phones/<phone_id>`. Saves that wait for that
   phone are deleted.

## Also check

- Without website access (Firefox can hold it back), the page shows "Website
  access" with "Allow on all websites" first.
