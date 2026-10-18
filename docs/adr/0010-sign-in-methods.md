# ADR-0010: Fill the provider login only on the provider's own pages

Status: Accepted.
Date: 2026-10-18.

## Context

Many sites use "Sign in with Google" (or Apple, GitHub, Microsoft, Facebook)
instead of a password. Nodkey on the phone now keeps how the person signs in to
each site, and the second step to choose (peters/nodkey#85). The protocol
("Sign-in methods" in `docs/agent-protocol.md`, peters/nodkey-cli) adds
`method`, `via` and `second_step` to login and code answers, and the request
kinds `suggest` and `sms_code`.

`via` is the login of the provider (for example the Google login). It comes
with the answer for the site, under the same Face ID. A page of the site must
never get it: a site that asks for the Google password is not Google.

## Decision

1. When an approved login answer has a method other than `password` and no
   password for the site, the page shows how the person signs in. For a
   `federated` method, the card has a button that presses the provider button
   of the page. The extension fills nothing on the site.
2. The background keeps `via` in memory only, for one tab and for 3 minutes.
   It never writes it to storage (AGENTS.md). In Chromium the service worker
   can stop before that; then the provider page asks the phone again.
3. The background fills `via` only in a frame whose host passes
   `nodkey_proto::signin::may_fill_via` (the provider's own registrable
   domains, never the target site). The content script then fills only the
   frame that the browser named. It fills the user name and the password, and
   a code while `seconds_left` is valid. Otherwise it asks the phone as usual.
4. The method and the second step order of an answer (no secret) stay in
   session storage for the browser session.
5. At a phone prompt ("Check your phone", "Tap Yes") with a "Try another way"
   link, the content script shows the Nodkey button only when the order of the
   site prefers `passkey` or `totp`, or when the provider login has a code.
   A click opens the other ways, gives the offered steps to
   `SecondStepOrder::pick`, and clicks the chosen way. For a code, the next
   page fills the code.
6. On a page that says that the site sent a code by SMS, the button of the
   code field sends `sms_code`. The phone gets the code from the person's
   Shortcuts automation. When the wait ends, the page names the automation.
7. After a trusted click on a provider button, a visit to the provider's pages
   and the return to the site, the page asks "Remember that <site> uses
   <provider> sign-in?". The question is not asked when the site is on the
   never-offer list, when saving is off, when the phone named that method for
   the site already, or when the page still shows the provider button or a
   password field. "Remember" sends `suggest` with the site and the provider
   only, as `seen` from `extension`.

## Consequences

- The click detection reads the text of buttons and links in the page. It
  sends nothing until the person answers the question.
- The text patterns for providers, phone prompts and choices are in English
  and the other languages of the app. A site with other words shows no Nodkey
  button at its prompt; the normal fill still works.
- The browser test needs a stand-in for Google's pages on
  `https://accounts.google.com:<port>`. The run resolves that name to this
  computer and accepts a certificate made for the run
  ([Sign-in methods](../features/sign-in-methods.md)).
