# Themes and languages

## Procedure

1. Set the desktop or browser to dark mode. Open the popup, the settings page,
   the Nodkey button, a status card and the save question.

   Result: The colours are the dark Flis colours: background `#11141a`, cards
   `#1a1f27`, green `#5fd3a5`. All text is easy to read. (screenshot of each)

2. Do step 1 in light mode.

   Result: Background `#fbfaf7`, cards white, green `#138a63`. (screenshot of
   each)

3. Start Chromium with `--lang=nb`. Open the popup and fill a login.

   Result: All text is Norwegian, for example "Fyll inn innlogging" and "Fylte
   inn innloggingen for localhost.". (screenshot)

4. Start the browser in another of the twelve languages (for example `--lang=ja`
   in Chromium).

   Result: All text is in that language. No text is cut off in the popup.

## Also check

- The page titles use Bricolage Grotesque. Body text uses the system font.
- With text zoom at 200 %, the popup and the settings page do not need
  horizontal scrolling.
