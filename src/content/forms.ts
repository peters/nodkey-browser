/**
 * Finds the fields Nodkey fills in a page: the user name and password of a sign-in form, a
 * one-time code field (or a row of one-digit boxes), and what the person typed when they submit.
 * Pure DOM logic, tested with jsdom; `isVisible` comes from the caller (jsdom has no layout).
 */

export type Visible = (el: HTMLElement) => boolean

export function layoutVisible(el: HTMLElement): boolean {
  if (el.hidden || el.getClientRects().length === 0) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05
}

function usable(el: HTMLInputElement, isVisible: Visible): boolean {
  return !el.disabled && !el.readOnly && isVisible(el)
}

const USERNAME_HINT = /user|login|email|e-mail|mail|account|konto|brukernavn|identifier|phone/i
const OTP_HINT = /otp|one.?time|2fa|mfa|totp|token|verif|security.?code|auth.?code|\bcode\b|kode/i
/** Short fields that are not one-time codes. */
const NOT_OTP =
  /zip|postal|post.?code|postnummer|promo|coupon|voucher|discount|gift|country|area|phone/i

function hint(el: HTMLInputElement): string {
  return [
    el.name,
    el.id,
    el.placeholder,
    el.getAttribute('aria-label') ?? '',
    el.autocomplete,
  ].join(' ')
}

function inputs(root: ParentNode): HTMLInputElement[] {
  return Array.from(root.querySelectorAll('input'))
}

function isTextLike(el: HTMLInputElement): boolean {
  return ['text', 'email', 'tel', ''].includes(el.type)
}

export function isOtpField(el: HTMLInputElement): boolean {
  if (el.autocomplete === 'one-time-code') return true
  if (!isTextLike(el) && el.type !== 'number') return false
  const max = el.maxLength
  const shortOrNumeric = (max >= 4 && max <= 10) || el.inputMode === 'numeric'
  return shortOrNumeric && OTP_HINT.test(hint(el)) && !NOT_OTP.test(hint(el))
}

/** The user name field that belongs to `password`: the nearest suitable field before it. */
function usernameFor(password: HTMLInputElement, isVisible: Visible): HTMLInputElement | null {
  const scope: ParentNode = password.form ?? password.ownerDocument
  const all = inputs(scope)
  const before = all.slice(0, all.indexOf(password)).reverse()
  const candidates = before.filter(
    (el) => isTextLike(el) && usable(el, isVisible) && !isOtpField(el),
  )
  return (
    candidates.find((el) => el.autocomplete === 'username' || el.autocomplete === 'email') ??
    candidates.find((el) => el.type === 'email' || USERNAME_HINT.test(hint(el))) ??
    candidates[0] ??
    null
  )
}

export interface LoginFields {
  username: HTMLInputElement | null
  password: HTMLInputElement | null
}

/**
 * The sign-in fields of the page, preferring the field the person is in. Handles a user name step
 * without a password field (the password comes on the next page).
 */
export function findLogin(
  root: Document,
  isVisible: Visible = layoutVisible,
  focused: Element | null = root.activeElement,
): LoginFields | null {
  const passwords = inputs(root).filter((el) => el.type === 'password' && usable(el, isVisible))
  const current =
    passwords.find((el) => el === focused) ??
    passwords.find((el) => el.autocomplete !== 'new-password') ??
    passwords[0]
  if (current) return { username: usernameFor(current, isVisible), password: current }
  const user =
    inputs(root).find(
      (el) =>
        el === focused && isTextLike(el) && usable(el, isVisible) && USERNAME_HINT.test(hint(el)),
    ) ??
    inputs(root).find(
      (el) =>
        usable(el, isVisible) &&
        (el.autocomplete === 'username' || el.autocomplete === 'email' || el.type === 'email'),
    )
  return user ? { username: user, password: null } : null
}

/**
 * The one-time code field(s): one field, or a row of at least four one-character boxes (filled one
 * digit each).
 */
export function findOtp(root: Document, isVisible: Visible = layoutVisible): HTMLInputElement[] {
  const all = inputs(root).filter((el) => usable(el, isVisible))
  const single = all.find((el) => isOtpField(el) && el.maxLength !== 1)
  if (single) return [single]
  const boxes = all.filter((el) => el.maxLength === 1 && (isTextLike(el) || el.type === 'number'))
  for (const box of boxes) {
    const row = boxes.filter(
      (b) =>
        b.parentElement?.parentElement === box.parentElement?.parentElement ||
        b.parentElement === box.parentElement,
    )
    if (row.length >= 4 && row.length <= 8) return row
  }
  return []
}

/** What the person submitted: the user name and the new (or only) password. */
export function submission(
  scope: ParentNode,
  isVisible: Visible = layoutVisible,
): { username: string; password: string } | null {
  const passwords = inputs(scope).filter(
    (el) => el.type === 'password' && el.value !== '' && isVisible(el),
  )
  const first = passwords[0]
  const last = passwords.at(-1)
  if (!first || !last) {
    // A user name step: the password comes on the next page.
    const user = inputs(scope).find(
      (el) =>
        isTextLike(el) && el.value.trim() !== '' && isVisible(el) && USERNAME_HINT.test(hint(el)),
    )
    return user ? { username: user.value.trim(), password: '' } : null
  }
  // Sign-up and change-password forms ask for the new password (twice); it is the one to keep.
  const fresh = passwords.filter((el) => el.autocomplete === 'new-password').at(-1)
  const repeated = passwords.length >= 2 && passwords.at(-2)?.value === last.value
  const password = fresh?.value ?? (repeated ? last.value : first.value)
  const username = usernameFor(first, isVisible)?.value.trim() ?? ''
  return { username, password }
}
