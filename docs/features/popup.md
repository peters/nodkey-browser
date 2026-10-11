# Popup

## Preparation

The browser is paired with the fake phone. Open `/login` on the test site.

## Procedure

1. Click the Nodkey button in the browser toolbar.

   Result: The popup shows the site `localhost` on a green tile with its first
   letter, and the buttons "Fill login" and "Fill code". (screenshot)

2. Set the fake phone to `silent` and click "Fill login".

   Result: The buttons are not available. The popup shows "Approve on your
   iPhone" with a spinner. (screenshot)

3. Close and open the popup again during the wait.

   Result: The popup shows the same state. The background keeps the request.

4. With a save that waits (see [Refusals](refusals.md), step 3), open the
   popup.

   Result: "Waiting to be saved" shows the site and the user name, with "Send
   again" and "Discard".
