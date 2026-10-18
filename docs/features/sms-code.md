# Codes sent by SMS

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.
The fake phone waits for a message that a test gives with `PUT /_fake/sms`.

## Procedure

1. Open `/sms` on the test site. Put the cursor in the code field.

   Result: The Nodkey button shows in the field. Its label is "Get the SMS
   code with Nodkey".

2. Click the Nodkey button.

   Result: A card shows "Waiting for the SMS. When it arrives, approve on your
   iPhone." The fake phone has an `sms_code` request with `wait_seconds: 120`.
   (screenshot)

3. Give the message to the fake phone:

   ```sh
   curl -X PUT -H 'content-type: application/json' \
     -d '{"text":"Your code is 482913. Do not share it."}' <relay>/_fake/sms
   ```

   Result: Nodkey fills `482913` and shows "Filled the code for localhost."

4. Load `/sms` again and click the Nodkey button. Then end the wait:
   `-d '{"expire":true}'` to `/_fake/sms`.

   Result: The field stays empty. The card shows "No SMS code reached Nodkey in
   time. On your iPhone, check the Shortcuts automation that sends codes to
   Nodkey." (screenshot)
