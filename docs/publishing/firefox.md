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
   errors". Warnings are possible. Read them.

4. Click "Continue".

5. When AMO asks "Do you need to submit source code?", select "Yes" and select
   `dist/nodkey-browser-source-<version>.zip`. The package has minified
   JavaScript from Vite and WebAssembly from Rust, so the reviewers need the
   source code.

6. In "Notes to Reviewer", write how to build:

   ```text
   Source: https://github.com/peters/nodkey-browser (tag v<version>).
   Build: Node 24.21 (.nvmrc), Rust with wasm32-unknown-unknown and
   wasm-bindgen-cli (version in Cargo.lock). npm ci && npm run build.
   The package is dist/nodkey-firefox-<version>.zip.
   The protocol code (WebAssembly) comes from https://github.com/peters/nodkey-cli
   at the revision in Cargo.toml.
   ```

7. Click "Submit Version".

   Result: The version page shows "Approved" after some minutes, and a link
   to the signed file.

8. Download the signed file (`.xpi`). Keep it outside the repository.

9. Install it: open the `.xpi` file in Firefox and click "Add".

   Result: Firefox shows what the extension collects (authentication
   information, website activity, website content) and adds Nodkey. It stays
   after a restart.

## Listed version (public)

Do this only after the owner says yes to a public release.

1. Do the steps of the unlisted version, but use "Submit a New Add-on" and
   select "On this site".

2. Fill in the listing:
   - Name: Nodkey. Summary: one sentence from `README.md`.
   - Description: from "What it does" in `README.md`.
   - Categories: "Privacy & Security".
   - Support website: `https://kh-labs.dev/nodkey/`.
   - Privacy policy: the extension sends data to the owner's iPhone, so a
     privacy policy is necessary. Use `https://kh-labs.dev/nodkey/#privacy`
     and make sure that it tells about the browser extension.
   - Screenshots: 1280×800, from the visual test procedures, with synthetic
     data only. `docs/images/demo.gif` shows the flow.
   - License: MIT.

3. Click "Submit Version".

   Result: The status is "Awaiting Review". A reviewer can ask questions by
   e-mail. Answer them in the AMO review thread.

## Problems

| Message | Cause | Remedy |
|---|---|---|
| The "data_collection_permissions" property is missing | Since 2025 AMO needs it for all new extensions | It is in `scripts/build.mjs`. Keep it, and keep `strict_min_version` at 140 or more. |
| Version already exists | AMO saw this version number before | Increase `version` in `package.json` and build again. |
| The add-on id is in use | Another account has the id | Use the account that uploaded the id first. |
| Source code is necessary | The package has minified code | Upload the source package (step 5). |
