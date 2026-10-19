# ADR-0011: Fill only on the website of the answered account

Status: Accepted.
Date: 2026-10-19.

## Context

The extension asks the phone for a login or a code for the site of the page.
The phone finds the account and answers. Before this decision, the background
filled the answer into the page without a check of the account in the answer.
Thus a matching fault on the phone side became a fill on a website that the
login was not saved for. An answer that a lease gives has no person who looks
at it (security review, finding MA-2, issue #8).

The protocol now has one rule for websites ("Websites" in
`docs/agent-protocol.md`, peters/nodkey-cli): two hosts are the same website
when their registrable domains from the Public Suffix List are equal. The
phone matches by this rule (peters/nodkey#99), and every agent gets
`fill_only_on` with the sites where it can fill.

## Decision

1. Before the background fills a login or a code, it gets `fill_only_on` from
   `nodkey_proto::site::fill_only_on` (WebAssembly: `fill_only_on`). It gives
   only the account and `match` of the answer to the module, never a secret.
   The sites are the registrable domains of the account's site and of its extra
   websites. When the person picked the account by hand for this site on the
   phone (`match: "chosen"`), the site is the site of the request.
2. The background fills only when the page passes
   `nodkey_proto::site::may_fill` (WebAssembly: `may_fill`): its host is one of
   the sites or below one.
3. Else it fills nothing and shows a calm note on the card: "Not filled: Nodkey
   saved this account for vg.no, not for vg.example." or, for an account
   without a website, "Not filled: this account has no website in Nodkey that
   matches vg.example."
4. An SMS code has no account. The check does not apply to it.
5. A `match` value that this version does not know counts as absent, not as
   `chosen`.

## Consequences

- A fault on the phone side, or an answer from an older phone that matched by
  name only, does not become a fill on another website.
- The person can still use an account on a new website: they pick it on the
  phone (`chosen`), or they add the website to the account.
- The WebAssembly module carries the Public Suffix List (about 340 KB, about
  110 KB more in the zip). An update of the list comes with a new revision of
  `nodkey-proto`.
- Test: `tests/unit/signin.integration.test.ts` ("the answered account against
  the page") with the fake phone (`PUT /_fake/account`), and the WebAssembly
  tests against the shared `sites` vectors.
