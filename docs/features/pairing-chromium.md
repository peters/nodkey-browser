# Pairing in Chromium

## Preparation

Start [the browser run](browser-e2e.md) with `--browser chromium`.

## Procedure

1. The run opens the popup page in a tab.

   Result: The page shows the Nodkey mark, "Settings" at the top and the card
   "Pair with your iPhone" (Norwegian: "Koble til iPhonen din"). The name field
   shows "Chromium on Linux". (screenshot)

2. The run types the name "Chromium test" and clicks "Get a code".

   Result: The card shows a 6-character code in large type (for example
   `K7P-2QX`), a spinner with "Waiting for your iPhone" and "The code is valid
   for 5 minutes". (screenshot)

3. The fake phone claims the code.

   Result: The card "Compare the numbers" shows the phone name "Test iPhone"
   and a check number with two groups of 3 digits. The number is the same as
   the number of the fake phone (`/_fake/check/<agent_id>`). (screenshot)

4. The run clicks "Same number".

   Result: The pairing card closes. The popup shows "Open a website to sign in
   with Nodkey."

## Also check

- Click "Different number" instead in step 4. Result: The text says that the
  pairing was removed and tells you to remove the browser under Agents.
- Click "Cancel" while the code shows. Result: The first card shows again.
