# ADR-0009: Fill a payment card only for an amount that the person sees

Status: Accepted. ADR-0013 changes decision 3 and 4 and the limit "Payment frames".
Date: 2026-10-14.

## Context

Nodkey can keep payment cards on the phone (peters/nodkey#67). The owner
decided that an agent must not empty a card. Each card request must show the
shop and the amount, and the person must approve with Face ID each time.

A checkout page shows the order total, but the page can change the total after
the person approves. A page script or an agent can also try a total that is
lower than the real total.

The protocol has `kind: card` with `mode: fill` (docs/agent-protocol.md in
peters/nodkey-cli). The request must have the amount, the origin of the page
and, when the host can read it, the total on the page.

## Decision

1. The content script finds the card fields from `autocomplete` (`cc-number`,
   `cc-exp`, `cc-exp-month`, `cc-exp-year`, `cc-csc`, `cc-name`). When a page
   has no `autocomplete`, it uses the field name, the id, the placeholder and
   the label in the twelve languages of the app.
2. The content script reads the order total from the page. It uses elements
   that have "total" or "sum" in their id or class, and lines with a total
   label ("Totalt", "Total", "Gesamt", ...). It does not use lines for the
   sub-total, tax, shipping or discounts. When it finds more than one total, it
   uses the largest. Thus a mistake shows the person a higher amount, never a
   lower amount.
3. When the page shows no total with a currency, the person types the amount
   and selects the currency. The request then has `total_source: user`.
4. The background makes the request. The origin comes from the address of the
   frame, which the browser gives. It never comes from the page. The merchant
   is the site of the tab. The background refuses a frame that is not on the
   site of the tab.
5. Before it fills, the content script reads the total again. It does not fill
   when the total is now more than `approved_amount`.
6. After the fill, the content script reads the total again each 0.7 seconds,
   until the person sends the form, the page closes or 15 minutes go by. When
   the total becomes more than `approved_amount`, it clears the number, the
   expiry and the CVC, and it tells the person.
7. The extension never clicks the pay button. It never keeps a card in storage
   and never writes a card to a log. The card goes from the phone, through the
   background, to the frame, and then into the fields.
8. A card that the person types and submits is sealed to the phone at once
   (`nodkey/v1/card`, as in ADR-0005). Then the person can save it in Nodkey.
   The extension does not offer a card that Nodkey filled in the last 10
   minutes.

## Limits

- **Payment frames.** Many shops show the card fields in a frame from a
  payment provider (for example `js.stripe.com`). The origin of that frame is
  not on the site of the shop, so the extension does not fill it. The person
  sees "The card fields belong to another website".
- **Currencies.** The content script knows the ISO codes and the signs of
  common currencies. "kr" is NOK, SEK, DKK or ISK from the language of the page
  or the top-level domain. Other pages need a typed amount.
- **Decimal comma.** "1.234" and "1,234" are 1234 (a thousands group). Thus an
  amount with three decimals and only one separator is read wrong. The
  currencies with three decimals are rare in shops.
- **Totals in images or canvas** cannot be read. The person types the amount.
- **The DOM.** After the fill, the number is in the value of the field. A page
  script or a browser agent with access to the DOM can read it. The phone shows
  the shop and the amount, and the limits of the person apply.

## Consequences

- The person sees the same amount on the page, in the extension card and on the
  phone.
- A shop that raises the total after the approval does not get the card.
- The extension cannot fill cards in frames of payment providers in this
  version.
