# Chrome Web Store

The Chrome Web Store gives the extension to Chrome, Edge (from the Chrome Web
Store too), Brave and other Chromium browsers. Each version gets a review
before it is available. The visibility can be:

- **Private**: only the testers that you add.
- **Unlisted**: everyone with the link can install it. Search does not show it.
- **Public**: everyone can find and install it.

All three need a review. The host permission `<all_urls>` gives a longer
review, often some days.

Status on 2026-10-14: no developer account and no item yet.

## One time: the developer account

1. Open `https://chrome.google.com/webstore/devconsole` and sign in with the
   owner's Google account. The account needs two-step verification.

2. Accept the developer agreement and pay the registration fee (one payment).

3. Verify the contact e-mail address. Open the link in the e-mail from the
   Chrome Web Store.

4. In "Account", give the publisher name ("KH Labs", the same as on AMO) and
   tell if the account is a trader (the EU Digital Services Act asks this).

## New item (first version)

1. Do [Prepare a release](README.md#prepare-a-release).

2. In the developer dashboard, click "New item" and select
   `dist/nodkey-chromium-<version>.zip`.

   Result: The dashboard shows the item with the tabs "Package", "Store
   listing", "Privacy" and "Distribution".

3. "Store listing" (make the files first, see [Store material](store-material.md)):
   - Description: from `store/out/chrome/<locale>/listing.txt`. Add the other
     eleven languages with "Add language" and paste each description; the
     name and summary come from `_locales` in the package.
   - Category: "Productivity", subcategory "Tools" (or what the store offers
     for password tools).
   - Language: English. The extension has twelve languages; the store takes
     the name and description from `_locales`.
   - Store icon: 128×128 PNG, `public/icons/icon-128.png`.
   - Screenshots: `01-sign-in.png` to `05-one-place.png` (1280×800) from the
     folder of each language.
   - Small promo tile: `promo-440x280.png`. Marquee (optional):
     `marquee-1400x560.png`.
   - Official URL and support URL: `https://kh-labs.dev/nodkey/`.

4. "Privacy":
   - Single purpose: "Fill logins, two-step codes and passkeys from Nodkey on
     the user's iPhone, and offer to save new logins there."
   - Permission justifications:

     | Permission | Justification |
     |---|---|
     | `storage` | Keeps the pairing, the settings and the list of sites where the user does not want a save offer. Never a password or a code. |
     | `activeTab` | Takes a picture of the current page for the notification on the iPhone, when the user turns this on. |
     | `scripting` | Adds the page script that sends the passkey requests of a page to Nodkey. |
     | Host permission `<all_urls>` | Shows the Nodkey button in sign-in fields on all websites and fills the login that the user approved on the iPhone. |

   - Remote code: "No, I am not using remote code". The WebAssembly is in the
     package.
   - Data usage: select "Authentication information" and "Website content".
     Ask the owner if "Web history" also applies (each request names the site
     of the current page). Select the three certifications.
   - Privacy policy: `https://kh-labs.dev/nodkey/#privacy`. Make sure that it
     tells about the browser extension.

5. "Distribution": select the visibility that the owner chose (see the top of
   this page) and the regions (all).

6. Select "Defer publish" if the owner wants to publish by hand after the
   review. Click "Submit for review".

   Result: The status is "Pending review". The store sends an e-mail when the
   review is done.

7. If the review refuses the item, read the e-mail. Change the code or the
   listing, increase the version, and submit again.

## New version of the item

1. Do [Prepare a release](README.md#prepare-a-release).

2. Open the item, then "Package", then "Upload new package". Select
   `dist/nodkey-chromium-<version>.zip`.

3. Look at "Privacy" again if the permissions changed. Each new permission
   needs a justification.

4. Click "Submit for review".

   Result: Users keep the old version until the review approves the new one.
   Then Chrome updates the extension.

## Problems

| Message | Cause | Remedy |
|---|---|---|
| Version must be greater than | The store saw this version | Increase `version` in `package.json`. |
| Missing permission justification | A permission has no text | Fill in the table in "Privacy". |
| Rejected: excessive permissions | The reviewer thinks `<all_urls>` is too much | Explain in the appeal that the button must show in sign-in fields on all websites. |
