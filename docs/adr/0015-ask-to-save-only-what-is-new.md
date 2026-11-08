# ADR-0015: Ask to save only what is new

Status: Accepted.
Date: 2026-11-08.

## Context

The extension asks "Send to your phone?" when the person submits a login or a
card. It must not ask again for a login or a card that Nodkey filled, that the
phone saved, or that the person said "Not now" to.

The background of the extension is an MV3 service worker in Chromium and an
event page in Firefox. The browser stops it after about 30 seconds without
work. An in-memory list of the logins and cards to skip is thus empty when the
person submits the form, and the question came every time.

The browser must not keep a password or a card number to compare with later
(ADR-0002, ADR-0005).

A page can also submit from a script, and many pages have widgets that look
like a button but are not a submit: a custom select, a menu, a tab, a switch,
the button that shows a password. A click in such a widget must not send the
card of the checkout page to the phone.

## Decision

The extension keeps a keyed fingerprint for each login and card that needs no
question, in `chrome.storage.local`: PBKDF2-SHA256 with 100 000 iterations over
the password, or over the digits of the card number. The salt is a random
secret of this install, the kind (login or card), the site and the user name.
The storage keeps only the fingerprint, the time and the reason (filled, saved,
declined), for 180 days and at most 2000 entries. The oldest go first. A new
password gives a new fingerprint, so the phone is asked about it. An unpair
deletes the fingerprints and the secret.

A click or an Enter key counts as a submit only when it is a real submit
button, or a button whose text says that it submits in one of the twelve
languages of the app. A click in a picker (a combobox, a listbox, an option, a
menu, a tab, a switch, a checkbox, a radio button), on a button that opens
something, or on a button that shows a password is not a submit. Enter in a
field that searches or picks a value is not a submit.

## Consequences

- The person gets the question once for each login and each card, also after
  the browser stopped the background, and again when a password changes.
- The storage holds no secret of the person. A fingerprint cannot be turned
  back into a password, a card number or a user name, and it is different in
  another install of the extension.
- The person is asked again after 180 days or after an unpair.
