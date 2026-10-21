# Code review instructions

These rules set the scope of the Claude review in this repository
(`.github/workflows/claude-review.yml`). `AGENTS.md` has the full project
rules.

## What to report

- Report a finding only when you can name a concrete input or state and the
  wrong result that it causes.
- A PR that lacks an item that `AGENTS.md` or this file requires is a finding
  without a runtime input.
- Report findings in the lines that this PR changes.
- In unchanged code, report only a problem that this PR causes, makes
  reachable or makes worse.
- In round 2, start with the lines that changed since round 1. In the other
  lines of this PR, report a missed defect only with a concrete trigger. Do not
  look there for new attack surfaces.
- Do not report a design decision that a code comment or a document on the
  base branch states as deliberate. For a PR from the owner, the PR body and
  the documents of this PR count too.
- Do not report a finding again when a reply from the owner or a collaborator
  on its thread gave the reason that it is not a defect. Report it again only
  when the code changes.
- Do not report style, naming or formatting.

## Rules for this repository

Read `SECURITY.md` ("What is in scope"), `docs/adr/README.md` and each record
in `docs/adr/` that the change touches.

- Web pages and frames are untrusted. Check where the extension may fill: a
  page that is not secure, a frame from another site, a website that does not
  match the login. The content script UI stays in its closed shadow root.
- A password or a code is never kept in storage, a log or a file. A password
  that waits to be saved is kept only sealed to the phone (ADR-0005).
- The private keys are non-extractable WebCrypto keys (ADR-0002). A way to
  export them is a finding.
- The protocol logic stays in `nodkey-proto` (peters/nodkey-cli). `wasm/` has
  thin exports only.
- User-facing text is in all twelve languages in `src/i18n/messages/`.
- The browser test never reaches the real relay or a real phone.
- A change to the data that leaves the browser keeps the store texts and data
  disclosures true (`docs/publishing/store-material.md`).
- No personal data and no secrets. Test data is invented.
- Each source file stays below 600 lines. Documents in `docs/` use ASD-STE100.
  No em dashes.
