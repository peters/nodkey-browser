# Publishing

These procedures put a new version of the extension in the browser stores.
They use ASD-STE100 Simplified Technical English. Do them for each release.

| Procedure | Store | Package |
|---|---|---|
| [Firefox](firefox.md) | addons.mozilla.org (AMO): unlisted (signed file only) or listed (public) | `dist/nodkey-firefox-<version>.zip` |
| [Chrome](chrome.md) | Chrome Web Store (Chrome, Edge, Brave and other Chromium browsers) | `dist/nodkey-chromium-<version>.zip` |
| [Store material](store-material.md) | Texts and images for both stores, in twelve languages | `store/out/` |
| Safari | Paused. See [ADR-0008](../adr/0008-safari-mac-app.md). | `dist/safari` in the Mac app |

## Rules

- Get the explicit yes of the owner before each submission. This also applies
  to an unlisted submission to AMO and to a private item in the Chrome Web
  Store. A submission sends the code to the store.
- Each submission must have a new version number. The stores refuse a version
  number that they have seen before, also after a failed submission.
- Use the same commit for the packages and for the source code. Do not change
  files between the build and the upload.
- Keep the store accounts, the API keys and the review messages out of this
  repository. Keep secrets in the owner's credential folder or in Nodkey.

## Tools for agents

- Use the `horizon:horizon-browser` skill and a Horizon browser panel for the
  web pages of the stores when the skill is available. Use a Chromium panel
  for `accounts.firefox.com`: Firefox treats that site as privileged, and the
  driver cannot read it there.
- Get the logins and the two-step codes from Nodkey (the `nodkey` skill). Do
  not keep them.
- Get the confirmation e-mails of the stores from the owner's mailbox (Gmail
  connector) when it is available.
- The agent can need a permission from the owner for each upload, because an
  upload sends the code out. Ask for it before you start.

## Prepare a release

1. Change `version` in `package.json` (for example `0.1.0` to `0.2.0`).

   Result: `scripts/build.mjs` writes this version into all manifests.

2. Run `npm run validate` and `cargo test`.

   Result: All checks pass, and `dist/` has the two zip files with the new
   version in their names.

3. Do the [visual test procedures](../features/README.md) that the changes
   affect. Do [Real phone](../features/real-phone.md) with the owner.

4. Commit and push.

5. Make the source code package from the same commit:

   ```sh
   git archive --format=zip -o dist/nodkey-browser-source-<version>.zip HEAD
   ```

   Push the commit (or a release branch, for example `release/0.1`) so the
   reviewers can find it. Do not tag it yet (step 8).

   Result: `dist/nodkey-browser-source-<version>.zip` exists. AMO needs it
   (see [Firefox](firefox.md)).

6. Make the [store material](store-material.md) when the listing must change.

7. Do [Firefox](firefox.md) and [Chrome](chrome.md).

8. Tag the commit only after the owner confirms that the published version
   works: `git tag v<version>` and `git push origin v<version>`. Do not push
   a tag before that.
