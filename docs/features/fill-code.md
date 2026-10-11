# Fill a code

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.

## Procedure: one code field

1. Open `/otp` and click in the code field.

   Result: The Nodkey button shows inside the right edge of the field.

2. Click the Nodkey button.

   Result: After the approval, the field shows `190274`. The card shows
   "Filled the code for localhost." (screenshot)

## Procedure: one box for each digit

1. Open `/boxes` and click in the first box.

   Result: The Nodkey button shows to the right of the last box, not in a box.
   (screenshot)

2. Click the Nodkey button.

   Result: The six boxes show `1 9 0 2 7 4`, one digit in each box.
   (screenshot)

## Also check

- A field for a postal code (for example `name="zip"`, `maxlength="5"`) does
  not get the Nodkey button for codes.
