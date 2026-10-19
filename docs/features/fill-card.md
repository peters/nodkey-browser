# Pay with a card from Nodkey

Test card numbers only: `4242 4242 4242 4242` (the fake phone) and
`5555 5555 5555 4444`.

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.
The fake phone has cards on, full card numbers on and a limit of 1000.00 NOK
for each purchase (the default; change it with `PUT /_fake/cards`).

## Procedure

1. Open `/checkout`. The page shows "Totalt 499,00 kr".

   Result: The page has the fields "Kortnummer", "Utløper", "CVC" and "Navn på
   kortet".

2. Click in "Kortnummer".

   Result: The Nodkey button shows in the right side of the field. Its label is
   "Pay with Nodkey".

3. Click the Nodkey button.

   Result: The card "Pay 499,00 kr" shows at the top right, with the site, the
   line "The total is read from the page: Totalt 499,00 kr", the button
   "Approve on iPhone" and the text "The card is filled in here and is not
   stored in the browser." A dashed ring shows around "499,00 kr" on the page.
   "Approve on iPhone" has the focus. (screenshot)

4. Push Enter.

   Result: The card shows "Approve the payment of 499,00 kr on your iPhone",
   then "Visa ····4242 filled in for at most 499,00 kr. Check the order, then
   pay." The fields show the test card, the expiry `12/30` and the CVC.
   (screenshot)

5. Look at `/_fake/seen` of the fake relay.

   Result: The last request has `kind: card`, `card.mode: fill`,
   `card.merchant: localhost`, `card.origin` the origin of the test site,
   `card.amount` and `card.page_total` 499.00 NOK and `card.total_source: page`.

6. Click "Legg til gavepapir (+100 kr)".

   Result: The total becomes "599,00 kr". In 1 second the number, the expiry
   and the CVC are empty. The card shows "The total changed to 599,00 kr after
   Nodkey filled in the card. Nodkey removed the card from the fields."
   (screenshot)

7. Type `5555 5555 5555 4444`, `11/31`, `321` and a name. Click "Betal".

   Result: The page goes to "Takk". The card "Save the card Mastercard ····4444
   in Nodkey?" shows "Expires 11/31" and the buttons "Save", "Not now" and
   "Never for this site". "Save" has the focus.

8. Push Enter.

   Result: The card shows "Confirm on your iPhone", then "The card is saved in
   Nodkey on your iPhone." In `/_fake/seen`, the last request has `kind: save`,
   `save_card.last4: 4444`, and `saved_card` is the number you typed. The fake
   phone opened the number that the extension sealed to it.

## Cards in a payment provider's frames

Many shops show the card fields in a frame from a payment provider. The browser
run has a stand-in provider on `https://js.pay.example:<port>` (ADR-0013).

9. Open `/billing`. The page has no total. The card fields are in one frame
   of `js.pay.example`.

   Result: The page shows "Betalingskort" and a frame with "Card number",
   "Expiry" and "CVC".

10. Click "Card number" in the frame, then the Nodkey button in the field.

    Result: The card of Nodkey shows at the top right of the page, not in the
    frame. It says "Nodkey found no total on this page.", "at localhost" and
    "via js.pay.example", and has the buttons "Add the card for later
    payments" and "Pay an amount". "Add the card for later payments" has the
    focus. (screenshot)

11. Push Enter.

    Result: The card shows "Approve adding your card on your iPhone", then
    "Visa ····4242 filled in to add it for later payments. No payment was
    approved." The frame shows the test card, `12 / 30` and the CVC. In
    `/_fake/seen`, the last card request has `card.purpose: setup`,
    `card.merchant: localhost`, `card.via: js.pay.example`, `card.origin` the
    origin of the frame, and no amount. (screenshot)

12. Open `/billing-split`. Each of the three fields is in a frame of its own.
    Click "Card number", then the Nodkey button. Push Tab, then Enter.

    Result: The card shows an amount field and a currency (NOK), with "Approve
    on iPhone". The amount field has the focus.

13. Type `250` and push Enter.

    Result: The card shows "Approve the payment of 250,00 kr on your iPhone",
    then "Visa ····4242 filled in for at most 250,00 kr." The number, the
    expiry and the CVC are each in their frame. The last card request has
    `card.amount` 250 NOK, `card.total_source: user` and `card.via:
    js.pay.example`. (screenshot)

## Also check

- Set `setup: false` (`PUT /_fake/cards`) and do steps 9 to 11. Result:
  "Adding cards for later payments is off for this browser. In Nodkey on your
  iPhone, open Agents, then this browser, and turn on “Add cards for later
  payments”." The frame stays empty.
- Set `PUT /_fake/passcode` to `false` and do steps 1 to 4, or 9 to 11.
  Result: "Your iPhone has no passcode, so Nodkey gives out no cards. You can
  set one in Settings → Face ID & Passcode." The fields stay empty. Set it to
  `true` again.
- Set the limit to 100 NOK (`PUT /_fake/cards`). Do steps 1 to 4. Result: "The
  amount is above your limit for this browser. Your iPhone said no without
  asking you." The fields stay empty.
- Set `enabled: false`. Result: "Cards are off for this browser." The fields
  stay empty.
- Remove the total from the page (DevTools). Click the Nodkey button. Result:
  The card offers "Add the card for later payments" and "Pay an amount". Click
  "Pay an amount", type `abc` and push "Approve on iPhone". Result: "Type the
  amount as a number, for example 499,00." Nothing is sent.
- Raise the total while the request waits on the phone, then approve. Result:
  "The total on the page is higher than the amount you approved. Nodkey did not
  fill in the card."
- Open the checkout page over plain HTTP on a site that is not local. Result:
  The Nodkey button does not show.
