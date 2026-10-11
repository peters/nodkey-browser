# Visual test procedures

These procedures test the extension in real browsers. Each procedure tells what
to prepare, the steps, the result to see and the evidence to keep. They use
ASD-STE100 Simplified Technical English. Do them again after a change that
affects what they test.

All procedures use the isolated desktop, the fake relay and phone and the
synthetic test site of [the browser run](browser-e2e.md). They never use the
real relay or a real phone. [Real phone](real-phone.md) is the only exception,
and it needs the owner.

| Procedure | What it tests | Automatic part |
|---|---|---|
| [Browser run](browser-e2e.md) | Start the desktop, the fake phone and the browsers | All |
| [Pairing in Chromium](pairing-chromium.md) | Pair from the popup; compare the check number | All |
| [Pairing in Firefox](pairing-firefox.md) | First-run page; set the relay; pair by hand | None |
| [Fill a login](fill-login.md) | The Nodkey button in a sign-in field; the fill; the status card | All |
| [Fill a code](fill-code.md) | One code field and a row of six boxes | All |
| [Save a new login](save-login.md) | The save question, Save, and the sealed password | All |
| [Refusals](refusals.md) | Denied, paused and no answer | None |
| [Pages without HTTPS](insecure-pages.md) | No fill on HTTP pages on the internet | None |
| [Settings page](settings-page.md) | Name, phone, requests, saving and relay settings | None |
| [Popup](popup.md) | The popup for a site, while waiting, and with saves that wait | None |
| [Themes and languages](themes-and-languages.md) | Light and dark; Norwegian and English text | None |
| [Keyboard and screen readers](keyboard.md) | Focus, labels and keyboard use | None |
| [Real phone](real-phone.md) | One request to the owner's iPhone | None |

## Evidence

For each run, keep this evidence in a private folder (not in the repository):

- The commit of this repository and the revision of `peters/nodkey-cli`.
- The browser versions.
- The VNC recording of the Horizon Device panel (WebM).
- One screenshot for each "Result" that the procedure marks with (screenshot).
- The log of `npm run e2e`.

Do not put screenshots or recordings with real data in the repository or in an
issue.
