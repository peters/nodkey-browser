# Chrome Web Store

The Chrome Web Store gives the extension to Chrome, Edge (from the Chrome Web
Store too), Brave and other Chromium browsers. Each version gets a review
before it is available. The visibility can be:

- **Private**: only the testers that you add.
- **Unlisted**: everyone with the link can install it. Search does not show it.
- **Public**: everyone can find and install it.

All three need a review. The host permission `<all_urls>` gives a longer
review, often some days.

Status on 2026-10-16: version 0.2.2 is in review (public, all regions,
publish automatically after the review). The item ID is
`gpgbjekgcppmdjjppnochkjjhppgkdpl`. The publisher is "KH Labs" (non-trader),
contact e-mail nodkey@kh-labs.dev.

## One time: the developer account

1. Open `https://chrome.google.com/webstore/devconsole` and sign in with the
   owner's Google account. The account needs two-step verification.

2. Accept the developer agreement and pay the registration fee (one payment).
   The owner's account had a developer account from before, so there was no
   fee.

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
   - Category: "Privacy & Security".
   - Store icon: 128×128 PNG, `public/icons/icon-128.png`.
   - Global screenshot: `store/out/chrome/en/01-sign-in.png`.
   - Small promo tile: `promo-440x280.png`. Marquee (optional):
     `marquee-1400x560.png`.
   - Homepage URL: `https://kh-labs.dev/nodkey/`. Support URL:
     `https://kh-labs.dev/nodkey/#help`. Official URL: "None". The store shows
     only domains that are verified in Google Search Console.
   - The name and the summary come from `_locales` in the package. Thus the
     store shows all twelve languages in "Current editing language".
   - Do these steps for each language, English first:
     1. Select the language in "Current editing language" (for example
        "Japanese – ja").
     2. Paste the description from `store/out/chrome/<locale>/listing.txt`.
     3. Add the five localized screenshots `01-sign-in`, `02-codes`,
        `06-cards`, `04-passkeys` and `05-one-place` (1280×800) from the
        folder of that language, in that order.
     4. Click "Save draft". Then change the language.

     Result: "Item saved." The language has a description and five
     screenshots.

4. "Privacy":
   - Single purpose: "Fill logins, two-step codes, payment cards and passkeys
     from Nodkey on the user's iPhone, and offer to save new logins there."
   - Permission justifications:

     | Permission | Justification |
     |---|---|
     | `storage` | Keeps the pairing, the settings and the list of sites where the user does not want a save offer. For the browser session only, it keeps how the user signs in to a site when the iPhone said so (for example "Sign in with Google"; no secret). Never a password, a code or a card number. |
     | `activeTab` | Takes a picture of the current page for the approval screen on the iPhone, when the user turns this on, so the user can see which page asks before approving. |
     | `scripting` | Adds the page script (in the package) that sends the passkey requests of a page (navigator.credentials) to Nodkey, so the iPhone can sign them. |
     | Host permission `<all_urls>` | Shows the Nodkey button in sign-in, code and card fields on all websites, and fills only the login, code or card that the user approved on the iPhone. A password manager cannot know in advance which sites the user signs in to. Nothing leaves the page until the user clicks the Nodkey button or accepts an offer to save a new login or to remember a sign-in method. A provider login (for example the Google login) is filled only on the provider's own sign-in pages. |

   - Remote code: "No, I am not using remote code". The WebAssembly is in the
     package.
   - Data usage: select "Authentication information", "Financial and payment
     information" (card fill, from 0.2.0), "Location" (from 0.3.0), "Web
     history" and "Website content".
     "Web history" applies because each request sends the site of the current
     page to the iPhone, end-to-end encrypted, only when the person asks for a
     login, a code, a card or a passkey, or accepts "Remember that <site> uses
     <provider> sign-in?" (that suggestion holds only the site and the name of
     the provider). Firefox declares the same as
     `websiteActivity`. The owner decided this on 2026-10-14.
     "Location" (region and IP address in the Chrome form) applies because the
     relay keeps the IP address that the browser connects from and its
     country with each request (2 minutes, up to 6 for an SMS code), so the
     iPhone can show where the request came from. The relay can read these two
     values; they are not end-to-end encrypted. Firefox declares the same as
     `locationInfo`. The owner decided this on 2026-10-19. Select the three
     certifications.
   - Privacy policy: `https://kh-labs.dev/nodkey/#privacy`. Make sure that it
     tells about the browser extension.

5. "Test instructions" (under "Access"): no user name or password. Tell the
   reviewer to pair with "Get a code" and Agents > Add agent in Nodkey, to
   confirm the same check number in the browser and on the iPhone (0.3.0
   needs the newest Nodkey from the App Store), then to click the Nodkey button in a sign-in
   field.

6. "Distribution": select the visibility that the owner chose (see the top of
   this page) and the regions (all).

7. Click "Submit for review". In the dialog, clear "Publish automatically
   after it has passed review" only if the owner wants to publish by hand.
   Click "Submit for review" in the dialog.

   Result: The store tells you that broad host permissions can delay the
   review. Click "Submit for review" again. The status is "Pending review".
   The store sends an e-mail when the review is done.

8. If the review refuses the item, read the e-mail. Change the code or the
   listing, increase the version, and submit again.

## New version of the item

1. Do [Prepare a release](README.md#prepare-a-release).

2. Open the item, then "Package", then "Upload new package". Select
   `dist/nodkey-chromium-<version>.zip`.

3. Look at "Privacy" again if the permissions or the data usage changed. Each
   new permission needs a justification. For 0.3.0: select "Location" in
   "Data usage" (see step 4 of the first submission). The permissions did not
   change in 0.3.0. Update "Test instructions" (step 5 of the first
   submission) and the description of each language from `listing.txt`. The
   Chrome Web Store has no field for version notes.

4. Click "Submit for review".

   Result: Users keep the old version until the review approves the new one.
   Then Chrome updates the extension.

## Problems

| Message | Cause | Remedy |
|---|---|---|
| Version must be greater than | The store saw this version | Increase `version` in `package.json`. |
| Missing permission justification | A permission has no text | Fill in the table in "Privacy". |
| Rejected: excessive permissions | The reviewer thinks `<all_urls>` is too much | Explain in the appeal that the button must show in sign-in fields on all websites. |
| "Submit for review" is not available | A tab has a missing field | Click "Why can't I submit?". It shows the missing fields. |
| "Publishing will be delayed" | The host permission `<all_urls>` | This is normal for Nodkey. Click "Submit for review" in the dialog. |
