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

An agent can do all the steps in [Firefox](firefox.md) and [Chrome](chrome.md)
with these tools. The owner does only the approvals.

- Use the `horizon:horizon-browser` skill and a Horizon browser panel for the
  web pages of the stores when the skill is available. Use a Chromium panel
  for both stores. Firefox treats `accounts.firefox.com` as privileged, and the
  driver cannot read it there.
- Get the logins and the two-step codes from Nodkey (the `nodkey` skill). Do
  not keep them. The Google sign-in for the Chrome Web Store asks for a code:
  click "Try another way", then select the authenticator app.
- Get the confirmation e-mails of the stores from the owner's mailbox (Gmail
  connector) when it is available.
- Do not write account names, e-mail addresses of persons, passwords or codes
  in this repository. Write "the owner's account".

### Permissions in auto mode

The Claude Code auto mode classifier can stop the browser actions of a store
submission. It thinks that they publish something or send a password.

- Do the submission in the session where the owner gave the yes. A subagent
  does not have the yes of the owner. The classifier stops it.
- If the classifier stops an action, do not try a different tool for the same
  action. Tell the owner. The owner opens `/permissions` and approves the
  stopped action in that session. Then do the action again.
- The owner must approve each tool one time: `browser_evaluate`,
  `browser_navigate` and `browser_act`. After that, the agent can do the full
  procedure.

### Browser panel notes

- `set_files` on an upload field of the Chrome Web Store reports
  `attachment_mismatch`, but the upload is correct. The page removes the file
  from the field after it reads it. Count the images after the upload to make
  sure.
- The Chrome Web Store has more than one `input[type=file]`. Give each one an
  `id` with `browser_evaluate` before `set_files`. On the store listing, the
  second field is for the localized screenshots.
- AMO makes the fields for each language with its own script. To fill in a
  language that the page does not show, add a `textarea` with the name
  `description_<locale>` (for example `description_nb-no`) to the form, then
  fill it. Captions use `files-<n>-caption_<locale>`. AMO keeps the values
  when you save.
- After you save, read the values again (for example the edit form of the
  section) to make sure that the store kept all languages.

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

## Version 0.3.0

Status on 2026-10-20: the code, the texts and the disclosures are ready in
`main` (version 0.3.0 in `package.json`). The Nodkey app 1.3 with the pairing
check (ADR-0012) and cards for later payments is on the App Store. The owner
said yes on 2026-10-20 to these submissions:

- Firefox: 0.3.0 as a listed version. The upload disables the version 0.2.2
  that waits for review (see [Firefox](firefox.md)).
- Chrome: cancel the review of 0.2.2, then submit 0.3.0 (see
  [Chrome](chrome.md)).

Nothing is uploaded yet. An iPhone with an app older than 1.3 gets "Update
Nodkey on your iPhone, then pair again." Cards for later payments need the
app part of peters/nodkey#125 too; an older app gets "Update Nodkey on your
iPhone to add cards for later payments."

Nodkey 1.3.0 on the iPhone cannot approve a passkey sign-in in the approval
screen inside the app: that screen shows only Deny. Approve once in the
notification works. Nodkey 1.3.1 adds Approve to the screen. The texts for
the reviewers tell this (`store/review/`).

What changes for the stores:

- Firefox: `locationInfo` in `data_collection_permissions` (in the package),
  the version notes, the notes to the reviewer
  (`store/out/firefox/notes-to-reviewer.txt`) and the privacy policy text
  (step 10 of the listed version).
- Chrome: "Location" in "Data usage", the test instructions
  (`store/out/chrome/test-instructions.txt`) and the descriptions. No new
  permission.
- Both: the description of each language (cards for later payments, payment
  frames, PRF, the check number, the relay and the IP address). The
  screenshots did not change.
- The texts are machine translations: get a native review before the public
  listing.
