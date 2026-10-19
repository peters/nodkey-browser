# Firefox: addons.mozilla.org

Firefox (release and ESR) installs only extensions that Mozilla signed. AMO
signs in two channels:

- **Unlisted** ("On your own"): AMO signs the file and does not show the
  extension on the website. You get a signed `.xpi` file to install yourself.
  The automatic review takes some minutes.
- **Listed** ("On this site"): AMO signs the file and shows the extension to
  everyone. A person at Mozilla can review it. Firefox updates it.

The add-on id is `nodkey@kh-labs.dev` (`scripts/build.mjs`). AMO connects the
id to the account of its first upload. Do not change the id.

## One time: the developer account

Status: done on 2026-10-14 (developer name "KH Labs"). Do these steps again
only for a new account.

1. Open `https://addons.mozilla.org/developers/` and sign in with the owner's
   Mozilla account. The account needs two-step authentication.

   Result: AMO asks for a developer profile.

2. Type a display name (the developer name that users see) and click
   "Create My Profile".

3. Open "Submit a New Add-on". Read the Firefox Add-on Distribution Agreement
   and the Review Policies, select the two check boxes and click "Accept".

4. Optional, for `web-ext sign`: open "Manage API Keys" and click "Confirm
   email address". Open the link in the e-mail from AMO, then click "Generate
   new credentials". Keep the JWT issuer and the JWT secret in the owner's
   credential folder. Never put them in this repository.

## Unlisted version (a signed file for the owner)

1. Do [Prepare a release](README.md#prepare-a-release).

2. Open `https://addons.mozilla.org/en-US/developers/addon/submit/upload-unlisted`.
   For a new version of the same add-on, open the add-on in "My Add-ons" and
   click "Upload New Version" instead.

3. Click "Select a file..." and select `dist/nodkey-firefox-<version>.zip`.
   Select "Firefox" as the compatible application. Do not select "Firefox for
   Android".

   Result: The automatic validation shows "Your add-on was validated with no
   errors". Warnings are possible. Read them. Version 0.1.0 had 4 warnings,
   for example "Unsafe assignment to innerHTML" from the bundled Vue code.

4. Click "Continue".

5. When AMO asks "Do you need to submit source code?", select "Yes" and select
   `dist/nodkey-browser-source-<version>.zip`. The package has minified
   JavaScript from Vite and WebAssembly from Rust, so the reviewers need the
   source code.

6. Click "Continue".

   Result: The page shows "Version Signature Pending". The unlisted flow does
   not ask for release notes or notes to the reviewer. AMO sends an e-mail
   when the signed file is ready, usually after some minutes.

7. Open "My Add-ons", the add-on, then the version. If a reviewer asks how to
   build, give these notes:

   ```text
   Source: https://github.com/peters/nodkey-browser (commit <sha>).
   Build: Node 24.21 (.nvmrc), Rust with wasm32-unknown-unknown and
   wasm-bindgen-cli (version in Cargo.lock). npm ci && npm run build.
   The package is dist/nodkey-firefox-<version>.zip.
   The protocol code (WebAssembly) comes from https://github.com/peters/nodkey-cli
   at the revision in Cargo.toml.
   ```

8. When the e-mail "Your extension has passed our automated screening" comes,
   open the version page and click the `.xpi` link. Do this in the browser
   where you are signed in: the link does not work without a session.
   Keep the file outside the repository. Version 0.1.0 was approved 6 minutes
   after the upload.

9. Install it: open the `.xpi` file in Firefox and click "Add".

   Result: Firefox shows what the extension collects (authentication
   information, financial and payment information, website activity, website
   content) and adds Nodkey. It stays
   after a restart.

10. Test the signed file before you give it to anyone:

    ```sh
    NODKEY_E2E_FIREFOX_XPI=<path to the .xpi> npm run e2e -- --browser firefox
    ```

    Result: Firefox installs the file as a normal extension and checks the
    signature. All flows pass (the pairing is by hand, see
    [Pairing in Firefox](../features/pairing-firefox.md)).

An unlisted extension does not update by itself: the manifest has no
`update_url`. Install each new signed file by hand (open the `.xpi` in
Firefox, then "Update").

## Listed version (public)

Do this only after the owner says yes to a public release.

Status on 2026-10-16: version 0.2.2 is the first listed version. Its status is
"Awaiting Review". The add-on page is `https://addons.mozilla.org/firefox/addon/nodkey/`.
The add-on had only unlisted versions before. The first listed version makes
the public listing.

1. Do [Prepare a release](README.md#prepare-a-release).

2. Open "My Add-ons", the add-on, and "Upload New Version".

   Result: The page shows "Where to Host Version" with the last channel.

3. If the page shows "On your own", click "Change". Select "On this site" and
   click "Continue".

4. Click "Select a file..." and select `dist/nodkey-firefox-<version>.zip`.
   Select only "Firefox" as the compatible application. Click "Continue".

   Result: "Your add-on was validated with no errors". Version 0.2.2 had 4
   warnings ("Unsafe assignment to innerHTML").

5. On the first listed version, AMO shows the page "Describe Add-on". (A new
   version of a listed add-on shows only the version notes.) Fill in:
   - Name and summary: AMO takes them from `_locales` in the package. AMO has
     no field for a language that it gets in another code. Thus add Norwegian
     Bokmål (`nb-NO`) by hand from `store/out/firefox/nb-NO/listing.txt`.
   - Description: the English text from `store/out/firefox/en-US/listing.txt`,
     and the text of each other language from its folder. AMO has no Danish
     locale, so the listing has eleven languages.
   - "This add-on requires payment, non-free services or software, or
     additional hardware": select it. Nodkey needs an iPhone with the Nodkey
     app.
   - Category: "Privacy & Security".
   - Support e-mail: `nodkey@kh-labs.dev`. Support website:
     `https://kh-labs.dev/nodkey/`.
   - License: "MIT License".
   - "This add-on has a privacy policy": select it. Paste the text of the
     browser extension part of the privacy policy and the link
     `https://kh-labs.dev/nodkey/#privacy` (the source is
     `site/i18n/en.json` in the `kh-labs` repository, keys
     `nkPrivacySummary`, `nkPAgents`, `nkPBrowser` and `nkPCards`).
   - Notes to Reviewer: use the text below. Change the commit and the version.

     ```text
     Nodkey needs an iPhone with the free Nodkey app (App Store). There is no
     account and no login.

     To test:
     1. Click the toolbar icon, then "Get a code".
     2. In Nodkey on the iPhone: Agents > Add agent, type the code, and
        compare the check number.
     3. Open a sign-in page and click the Nodkey button in the field.
        Approve on the iPhone.

     Source: https://github.com/peters/nodkey-browser (commit <sha>). The
     source package is attached.
     Build: Node 24.21 (.nvmrc), Rust with wasm32-unknown-unknown and
     wasm-bindgen-cli (version in Cargo.lock). npm ci && npm run build.
     The package is dist/nodkey-firefox-<version>.zip.
     The protocol code (WebAssembly) comes from
     https://github.com/peters/nodkey-cli at the revision in Cargo.toml.

     The innerHTML warnings: content.js sets a constant SVG icon string that
     is built into the package; the other uses are in the Vue runtime. No
     page or remote content goes into innerHTML.

     Contact: nodkey@kh-labs.dev
     ```

6. Click "Submit Version".

   Result: AMO shows "Do You Need to Submit Source Code?".

7. Select "Yes", select `dist/nodkey-browser-source-<version>.zip` and click
   "Continue".

   Result: "Version Submitted". The status is "Awaiting Review". A reviewer
   can ask questions by e-mail. Answer them in the AMO review thread.

8. Open "Edit Product Page", then "Images", then "Edit":
   - Icon: "Upload a Custom Icon...", `public/icons/icon-128.png`.
   - Screenshots: "Add a Screenshot..." and select the six files `01-sign-in`
     to `06-cards` from `store/out/firefox/en-US/`. AMO keeps one set of
     screenshots for all languages.
   - Captions: one caption for each screenshot and each language. Use
     "<title>. <text>" from `captions` in `store/listing/<language>.json`
     (for Japanese and Chinese, "<title>。<text>").
   - Click "Save Changes".

   Result: The page shows the icon and the six screenshots.

9. Open "Describe Add-on" and "Images" again with "Edit", and make sure that
   all eleven languages have a description and six captions.

## Problems

| Message | Cause | Remedy |
|---|---|---|
| The "data_collection_permissions" property is missing | Since 2025 AMO needs it for all new extensions | It is in `scripts/build.mjs`. Keep it, and keep `strict_min_version` at 140 or more. |
| Version already exists | AMO saw this version number before | Increase `version` in `package.json` and build again. |
| The add-on id is in use | Another account has the id | Use the account that uploaded the id first. |
| Source code is necessary | The package has minified code | Upload the source package (step 5 of the unlisted version, step 7 of the listed version). |
| The page shows "Not Found" for the add-on | You are not signed in | Click "Log in" and sign in. AMO then opens the page. |
