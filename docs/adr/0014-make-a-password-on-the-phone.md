# ADR-0014: Make a new password on the phone for a sign-up or a change

Status: Accepted.
Date: 2026-10-21.

## Context

On a page that asks for a new password ("Create a strong password"), the
Nodkey button asked the phone for a saved login. For a new account, the person
has no saved login, so they denied the request (peters/nodkey#131).

The protocol now has the request kind `generate` ("Making a password" in
`docs/agent-protocol.md`, peters/nodkey-cli). The phone asks the person with
Face ID, makes a password that fits the rules of the page, and saves it before
it answers. The answer has the password, the user name that the person
confirmed, the saved login and `saved: added` or `updated`.

## Decision

1. The content script finds a field for a new password
   (`src/content/newpassword.ts`):
   - `autocomplete="new-password"`, or a field name such as `new_password`;
   - two password fields of one form where the second one repeats the first
     ("Confirm", "Repeat", "Again", or a name such as `password2`);
   - labels and headings of the form with "create a password", "new password",
     "choose a password", or a sign-up heading ("Sign up", "Create an
     account"), in the twelve languages of the app. A sign-in heading on the
     same page cancels a sign-up heading. Links and buttons are not labels: a
     "Forgot password? Create a new password" link does not count;
   - three password fields (current, new, repeat), or a current and a new
     field: a password change (`change: true`).

   A field with `autocomplete="current-password"`, or a label such as
   "Current password", is a sign-in field. One password field without one of
   these texts is a sign-in field.
2. In a field for a new password, the Nodkey button opens a menu. The first
   choice is "Make a strong password". The second choice, "Use a saved login",
   is the usual login fill. The current password field of a change form gets
   the usual button. The menu has the same check as the button: a click counts
   only when nothing of the page covers it (issue #9).
3. The request has `target` (the host of the page), `generate.url` (without
   query and fragment), the title of the page, `change`, and the rules of the
   field (`passwordrules`, `minlength`, `maxlength`, `pattern`). A rule that
   breaks a limit of the protocol is left out. When no password can meet the
   rules (`Rules::check`, WebAssembly: `generate_rules_problem`), the card says
   so at once and nothing goes to the phone. The phone finds the rest (for
   example a `pattern` that no password matches) and answers `bad_rules`.
4. The user name is the one in the form. When the form has none, it is the
   user name from an earlier step of the same sign-up in this tab (Google asks
   for it on an earlier page). That user name is kept in `chrome.storage.session`
   (memory only, never on disk) for 5 minutes and is removed when the tab
   closes (ADR-0005). A hidden user name field (`autocomplete="username"`) also
   counts.
5. The extension uses an approved answer only when it has a password, `saved`
   (`added` or `updated`) and no lease other than `once`. It fills the
   password only when the frame that asked is on the website of `target`
   (`same_site`, the `fill_only_on` rule of the protocol), and the content
   script fills only in the frame that asked, in the last 3 minutes, on the
   site of the answer, never on plain HTTP on the internet. It fills the new
   field and the repeat field. A visible user name field of the form gets the
   user name that the person confirmed on the phone, so that the site and
   Nodkey have the same one.
6. After an approved answer, the tab keeps a marker (site and time, no secret)
   for 10 minutes. The save question does not come for that site in that tab:
   the phone saved the password already.
7. The card says "Saved in Nodkey" and, for a change, that the phone keeps the
   old password for 30 days. Refusals get short, calm texts: `no_passcode`,
   `bad_rules`, `not_allowed`, `save_failed`, `paused`, denied and no answer.

## Consequences

- The text patterns can miss a sign-up page with other words. The person then
  gets the usual login button and can type the password; the save question
  offers to save it.
- The patterns can take a sign-in page for a sign-up page. The menu then still
  has "Use a saved login".
- The phone, not the extension, makes the password. The extension never keeps
  it: it goes from the answer into the fields.
- The marker of item 6 can hide the save question for another login that the
  person types on the same site in the same tab within 10 minutes.
- Tests: `src/content/newpassword.test.ts` (sample pages: Google style sign-up,
  generic sign-up, password change, sign-in pages that must not count),
  `src/content/generate.test.ts`, `tests/unit/generate.integration.test.ts`
  against the fake phone, and the browser run (`docs/features/generate-password.md`).
