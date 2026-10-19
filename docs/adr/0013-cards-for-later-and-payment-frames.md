# ADR-0013: Add a card for later payments, and fill payment frames of other sites

Status: Accepted.
Date: 2026-10-19.

## Context

A billing page or a subscription often asks for a card without a total, so
that the site can charge it later. Many shops also show the card fields in a
frame from a payment provider (for example `js.stripe.com`). With ADR-0009, the
extension asked for an amount on such a page, showed the host of the frame as
the shop, and did not fill a frame of another site (peters/nodkey#125, a
screenshot of a billing page with a Stripe form).

The protocol now has `purpose: setup` for a card request without an amount, and
`via` for the host of a payment frame ("Payment cards" and "Cards for later
payments" in `docs/agent-protocol.md`, peters/nodkey-cli#29). On the phone,
"add cards for later payments" is a setting for each agent, off by default.

## Decision

1. The merchant is always the site of the top page (the address bar). The
   background gets it from the tab, never from a page.
2. A card field in a frame below the top page asks the background
   (`card.start`). The background gives the top page a ticket, and the top page
   shows the card of Nodkey. Thus the person sees the shop of the address bar
   and its total, also when the card form is in a small frame. A frame of
   another site shows as "via js.pay.example" on the card, in the reason and
   on the phone. A frame of another site cannot ask for a card by itself.
3. When the top page shows no total, the card offers two choices:
   - "Add the card for later payments": a request with `purpose: setup` and no
     amount. The approved answer has no `approved_amount`; the extension fills
     the card and does not watch a total.
   - "Pay an amount": the person types the amount (as before, `total_source:
     user`).
4. The background sends the card only to the frame that asked, and only while
   that frame is on the origin of the request (`origin`, the frame's origin
   from the browser). For a payment, the top page reads its total again before
   the fill and watches it after the fill. When the total goes up past the
   approved amount, the frames of that origin empty their card fields.
5. Some providers put the number, the expiry and the CVC each in a frame of its
   own. After the fill, the background sends the expiry, the CVC and the name
   (never the number) to the frames of the tab. Only frames of the same origin
   fill them.
6. Refusals: `setup_off` tells the person where to turn the setting on (Agents,
   this browser, "Add cards for later payments"). An app made before `setup`
   refuses it as `amount_missing`; the extension then says "Update Nodkey on
   your iPhone to add cards for later payments." A phone without a passcode
   gives no cards, for a payment or for later (`no_passcode`,
   peters/nodkey#126); the extension says so and where to set a passcode.

## Consequences

- The person sees the same shop and the same "via" host on the page and on the
  phone. A frame of another site on a shop's page (an advertisement, for
  example) can show a card field, but the card names its host, and the person
  approves each card with Face ID.
- A card for later payments has no amount, thus no limit on the phone applies.
  The phone asks every time, and the setting is off until the person turns it
  on for the browser.
- The extension fills a provider's frame as far as its fields are normal input
  fields. A provider that draws its fields in another way cannot be filled.
- Tests: `tests/unit/card.integration.test.ts` (setup, a ticket, `via`, the
  parts, a higher total in the top page), `src/content/cards.test.ts` (fields
  in split frames), and the browser run with the stand-in provider
  (`tests/e2e/cardframes.mjs`, [Pay with a card](../features/fill-card.md)).
