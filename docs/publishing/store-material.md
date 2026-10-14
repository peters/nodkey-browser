# Store material

The store texts and images come from the repository, in the twelve languages
of the extension. Make them again for each release that changes what the
extension does or how it looks.

| Source | What it holds |
|---|---|
| `store/listing/<lang>.json` | Name, summary, description, screenshot captions and the text in the images, for one language |
| `store/scenes.html` | The images: six screenshots (1280×800), a small promo tile (440×280) and a marquee (1400×560) |
| `store/assets/phone/<lang>.jpg` | The Passwords screen of the iPhone app in that language, from `peters/nodkey` `marketing/raw/<lang>/passwords.png` (sample data only) |
| `scripts/store.mjs` | Checks the texts and renders everything into `store/out/` (not in Git) |

The name and the summary come from `src/i18n/messages/<lang>.json`
(`extName`, `extDescription`), so the store and the browser show the same
text. Change them there.

## Languages

| Language | File | AMO locale | Chrome Web Store locale |
|---|---|---|---|
| English | `en` | en-US | en |
| Norwegian Bokmål | `nb` | nb-NO | no |
| Swedish | `sv` | sv-SE | sv |
| Danish | `da` | da | da |
| German | `de` | de | de |
| Spanish | `es` | es-ES | es |
| French | `fr` | fr | fr |
| Italian | `it` | it | it |
| Portuguese (Brazil) | `pt-BR` | pt-BR | pt_BR |
| Japanese | `ja` | ja | ja |
| Korean | `ko` | ko | ko |
| Chinese (Simplified) | `zh-Hans` | zh-CN | zh_CN |

The translations are machine-made (`review` in each file). Get a native
review before the first public listing.

## Make the material

1. Change the texts in `store/listing/<lang>.json` for all twelve languages.
   Keep the same keys in all files.

2. If the iPhone app looks different now, copy the new Passwords screens from
   `peters/nodkey` (`marketing/raw/<lang>/passwords.png`, 520 px wide, JPEG,
   quality 86) to `store/assets/phone/<lang>.jpg`. Make sure that they show
   sample data only.

3. Run the check:

   ```sh
   node scripts/store.mjs --check
   ```

   Result: "texts ok (12 languages)". The limits are: name 45, summary 132,
   caption title 44 and caption text 90 characters.

4. Render:

   ```sh
   node scripts/store.mjs
   ```

   Result: `store/out/firefox/<AMO locale>/` has the six screenshots
   `01-sign-in.png` to `06-cards.png` and `listing.txt`.
   `store/out/chrome/<Chrome locale>/` has five screenshots (the Chrome Web
   Store takes at most five: `03-save.png` is left out), `listing.txt`,
   `promo-440x280.png` and `marquee-1400x560.png`. The script stops with a
   message when a caption does not fit above the browser window.

5. Look at the images of at least English, Norwegian, German (long words) and
   Japanese. Make sure that no text is cut and that no real data shows.

6. Use the files in [Firefox](firefox.md) and [Chrome](chrome.md).

## When a feature changes

- A new feature that users see (for example payment cards): add a section to
  `description` and, if it is important, replace one screenshot (a new scene
  in `store/scenes.html` and a caption in each language).
- New data that leaves the browser: change the data disclosures too
  (`data_collection_permissions` in `scripts/build.mjs` and "Privacy" in
  [Chrome](chrome.md)), and the "Private by design" list in `description`.
