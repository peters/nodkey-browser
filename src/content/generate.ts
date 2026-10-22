/**
 * "Make a strong password" in a field for a new password (peters/nodkey#131): the menu of the
 * Nodkey button, the request with the user name and the page's rules, and the fill of the new
 * password into its field and the field that repeats it.
 */

import type { ToBackground, ToContent } from '../models/messages'
import { t } from '../i18n/t'
import { belongsTo, mayFill } from '../utils/site'
import { setValue } from './fill'
import {
  type NewPasswordForm,
  findNewPassword,
  newPasswordForm,
  rulesOf,
  signUpNameStep,
} from './newpassword'
import type { PageUi } from './ui'

type Send = <T>(msg: ToBackground) => Promise<T | null>

/** The form that asked the phone for a password, until the answer comes (at most 3 minutes). */
let asked: { form: NewPasswordForm; at: number } | null = null
const ASK_MS = 3 * 60_000

/**
 * The new-password form of `field` when its Nodkey button offers "Make a strong password". The
 * current password of a change form is a saved login, so that field gets the usual button.
 */
export function newFormOf(field: HTMLInputElement): NewPasswordForm | null {
  if (!mayFill(location.href)) return null
  const form = newPasswordForm(field)
  return form && form.current !== field ? form : null
}

/** A user name field of a sign-up step without a password field: the Nodkey button stays away. */
export function newNameField(field: HTMLInputElement): boolean {
  return mayFill(location.href) && signUpNameStep(field)
}

/** The menu of the Nodkey button: make a strong password first, a saved login second. */
export function openMenu(form: NewPasswordForm, ui: PageUi, send: Send, useSaved: () => void) {
  ui.showMenu([
    {
      label: t('genMake'),
      detail: t('genMakeDetail'),
      run: () => {
        makePassword(form, send)
      },
    },
    { label: t('genUseSaved'), run: useSaved },
  ])
}

function makePassword(form: NewPasswordForm, send: Send): void {
  asked = { form, at: Date.now() }
  const msg: Extract<ToBackground, { type: 'generate' }> = {
    type: 'generate',
    rules: rulesOf(form),
    change: form.change,
  }
  const username = form.username?.value.trim()
  if (username) msg.username = username.slice(0, 200)
  const title = document.title.trim()
  if (title) msg.title = title.slice(0, 100)
  void send(msg)
}

/**
 * Fills the new password the phone made and saved into the field and its repeat field: only in
 * the frame that asked, only on the site the phone answered for, never over plain HTTP. The
 * form's user name field gets the user name the person confirmed on the phone, so that the site
 * and Nodkey have the same one.
 */
export function fillNew(msg: Extract<ToContent, { type: 'fill.new' }>): boolean {
  if (!asked || Date.now() - asked.at > ASK_MS) return false
  if (!belongsTo(location.href, msg.site) || !mayFill(location.href)) return false
  // A page that drew its form again since the request: the same kind of form, found anew.
  const form = asked.form.password.isConnected ? asked.form : findNewPassword(document)
  if (!form) return false
  asked = null
  const user = form.username
  if (msg.username && user && user.type !== 'hidden' && user.value.trim() !== msg.username) {
    setValue(user, msg.username)
  }
  setValue(form.password, msg.password)
  if (form.confirm) setValue(form.confirm, msg.password)
  return true
}
