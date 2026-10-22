/**
 * Finds a form that asks for a new password (a sign-up, a password change, a reset) and the
 * page's rules for that password, so that the Nodkey button can offer "Make a strong password"
 * there (peters/nodkey#131). Pure DOM logic with text patterns in the twelve languages of the
 * app, tested with jsdom; `isVisible` comes from the caller.
 */

import type { PasswordRules } from '../models/protocol'
import {
  type Visible,
  USERNAME_HINT,
  hint,
  inputs,
  isOtpField,
  isTextLike,
  layoutVisible,
  usable,
} from './forms'

export interface NewPasswordForm {
  /** The field for the new password. */
  password: HTMLInputElement
  /** The field that repeats the new password. */
  confirm: HTMLInputElement | null
  /** The field for the current password of a change form. */
  current: HTMLInputElement | null
  /** The user name field of the form, when it has one. */
  username: HTMLInputElement | null
  /** A password change: the form asks for the current password too. */
  change: boolean
}

const re = (parts: string[]) => new RegExp(parts.join('|'), 'i')

/** "Create a password", "new password", "choose a password" in the twelve languages. */
const NEW_TEXT = re([
  String.raw`\b(create|choose|pick|set|make)\s+(an?\s+|your\s+)?((new|strong|secure)\s+)*password`,
  String.raw`\bnew\s+password`,
  String.raw`(opprett|lag|velg|sett)\s+(et\s+|ditt\s+)?((nytt|sterkt|sikkert)\s+)*passord|nytt\s+passord`,
  String.raw`(opret|lav|vælg)\s+(en\s+|din\s+)?((ny|stærk|sikker)\s+)*(adgangskode|kodeord)|\bnyt?\s+(adgangskode|kodeord)`,
  String.raw`(skapa|välj)\s+(ett\s+|ditt\s+)?((nytt|starkt|säkert)\s+)*lösenord|nytt\s+lösenord`,
  String.raw`(passwort|kennwort)\s+(erstellen|festlegen|wählen|vergeben|anlegen)|(erstelle|erstellen sie|wähle|wählen sie|lege|legen sie)\s+(ein|dein|ihr)\s+((neues|sicheres|starkes)\s+)*(passwort|kennwort)|neues\s+(passwort|kennwort)`,
  String.raw`(créer|créez|crée|choisir|choisissez|choisis|définir|définissez|définis)\s+(un\s+|votre\s+|ton\s+)?(nouveau\s+)?mot de passe|nouveau\s+mot de passe`,
  String.raw`(crear|crea|cree|elegir|elige|elija|establecer|establece|establezca)\s+(una\s+|tu\s+|su\s+)?(nueva\s+)?contraseña|nueva\s+contraseña|contraseña\s+nueva`,
  String.raw`(crea|creare|crei|scegli|scegliere|scelga|imposta|impostare|imposti)\s+(una\s+|la\s+(tua\s+)?)?(nuova\s+)?password|nuova\s+password`,
  String.raw`(criar|crie|cria|escolha|escolher|definir|defina)\s+(uma\s+|sua\s+)?(nova\s+)?senha|nova\s+senha`,
  'パスワードを?(作成|設定|決め)|パスワードの(作成|設定)|新しいパスワード',
  String.raw`새\s?비밀번호|비밀번호\s?(만들기|생성|설정)|비밀번호를\s?(만드|만들|생성|설정)`,
  '创建.{0,4}密码|新密码|设置.{0,4}密码|设定密码',
])

/** A field name or id for a new password (`new_password`, `newPass`, `signup-password`). */
const NEW_NAME = /new[-_]?pass|pass(word)?[-_]?new|create[-_]?pass|sign[-_]?up[-_]?pass/i

/** A field that repeats the password: "Confirm", "Repeat", "Again" in the twelve languages. */
const CONFIRM = re([
  String.raw`confirm|repeat|re-?enter|re-?type|again|verify`,
  String.raw`\b(pass(word|wd)?|pw)[-_]?2\b|(pass(word|wd)?|pw)[-_]?(conf|rep)`,
  'bekreft|gjenta|igjen|bekræft|gentag|igen|bekräfta|upprepa',
  'bestätig|wiederhol|erneut|nochmal|noch einmal',
  'répét|retap|ressais|à nouveau|repet|repit|de nuevo|otra vez|conferm|ripet|di nuovo',
  'novamente|de novo',
  '確認|再入力|もう一度|확인|재입력|다시|确认|再次|重复',
])

/** The current password of a change form: "Current", "Old" in the twelve languages. */
const CURRENT = re([
  String.raw`current|\bold\b|old[-_]?pass|existing`,
  String.raw`nåværende|gammelt|eksisterende|nuværende|gamle|nuvarande|gamla|befintlig`,
  String.raw`aktuell|bisherig|\baltes?\b|derzeitig|actuel|ancien`,
  String.raw`\bactual\b|anterior|antigua|attuale|vecchia|corrente|\batual\b|antiga`,
  '現在の|今の|古い|현재|기존|当前|旧密码|原密码',
])

/** A sign-up heading: "Sign up", "Create an account", "Register" in the twelve languages. */
const SIGN_UP = re([
  String.raw`sign\s?up|create\s+(an?\s+|your\s+)?(new\s+)?account|regist`,
  String.raw`(opprett|lag)\s+(en\s+)?(ny\s+)?(konto|bruker)|bli\s+medlem|opret\s+(en\s+)?(ny\s+)?(konto|bruger)|tilmeld`,
  String.raw`skapa\s+(ett\s+)?(nytt\s+)?konto|konto\s+erstellen|(erstelle|erstellen sie)\s+(ein|dein|ihr)\s+(neues\s+)?konto`,
  String.raw`inscri|(créer|créez)\s+(un\s+|votre\s+)?compte|(crear|crea)\s+(una\s+|tu\s+)?cuenta`,
  String.raw`(crea|creare)\s+(un\s+)?account|iscriviti|cadastr|(criar|crie)\s+(uma\s+|sua\s+)?conta`,
  String.raw`新規登録|会員登録|アカウントを?作成|アカウントの作成|회원\s?가입|계정\s?만들기|가입하기|注册|创建.{0,4}[帐账][户号]`,
])

/** A sign-in heading, which wins over a sign-up word on the same page ("Sign in or register"). */
const SIGN_IN = re([
  String.raw`sign\s?in|log\s?in|logg\s?inn|logga in|log ind|anmelden|einloggen|se connecter|connexion`,
  String.raw`iniciar sesión|inicia sesión|accedi|entrar|fazer login|ログイン|サインイン|로그인|登录|登入`,
])

const HEADINGS = 'h1, h2, h3, legend, [role=heading]'

/** The text of `el` without links and buttons: a "Forgot password?" link is not a label. */
function plainText(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest('a, button, [role=button], [role=link], script, style')) continue
    out.push(n.textContent ?? '')
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Everything that names a field: its attributes, its labels, and the text of the smallest part
 * of the page around it that has no other field (a label in a `div`, as many sites make them).
 */
export function labelOf(el: HTMLInputElement): string {
  const doc = el.ownerDocument
  const named = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map((id) => (id ? (doc.getElementById(id)?.textContent ?? '') : ''))
  const parts = [hint(el), el.title, ...Array.from(el.labels ?? [], (l) => l.textContent), ...named]
  let around: Element | null = null
  for (let p = el.parentElement, depth = 0; p && depth < 4; p = p.parentElement, depth++) {
    if (p === el.form || p === doc.body) break
    const fields = p.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select')
    if (fields.length > 1) break
    around = p
  }
  if (around) parts.push(plainText(around).slice(0, 200))
  return parts.join(' ').replace(/\s+/g, ' ')
}

function isNew(el: HTMLInputElement): boolean {
  if (el.autocomplete === 'new-password') return true
  return NEW_TEXT.test(labelOf(el)) || NEW_NAME.test(`${el.name} ${el.id}`)
}

function isCurrent(el: HTMLInputElement): boolean {
  if (el.autocomplete === 'new-password' || isNew(el)) return false
  return el.autocomplete === 'current-password' || CURRENT.test(labelOf(el))
}

/** The headings that belong to `form` (or to the page when it has only this password form). */
function headingText(field: HTMLInputElement, root: Document, isVisible: Visible): string {
  const visible = (els: Iterable<Element>) =>
    Array.from(els)
      .filter((h) => h instanceof HTMLElement && isVisible(h))
      .map((h) => plainText(h))
      .join(' ')
  const own = field.form ? visible(field.form.querySelectorAll(HEADINGS)) : ''
  if (own) return own
  const forms = new Set(
    inputs(root)
      .filter((el) => el.type === 'password' && usable(el, isVisible))
      .map((el) => el.form),
  )
  if (forms.size > 1) return ''
  return `${root.title} ${visible(root.querySelectorAll('h1, h2, [role=heading]'))}`
}

/** The user name field of a sign-up: only a field that clearly holds one, before the password. */
function usernameOf(password: HTMLInputElement, isVisible: Visible): HTMLInputElement | null {
  const scope: ParentNode = password.form ?? password.ownerDocument
  const all = inputs(scope)
  const before = all.slice(0, all.indexOf(password)).reverse()
  const shown = before.find(
    (el) =>
      isTextLike(el) &&
      usable(el, isVisible) &&
      !isOtpField(el) &&
      (el.autocomplete === 'username' ||
        el.autocomplete === 'email' ||
        el.type === 'email' ||
        USERNAME_HINT.test(hint(el))),
  )
  if (shown) return shown
  // The hidden user name that sites put next to a new password for password managers.
  return (
    all.find(
      (el) =>
        el.getAttribute('autocomplete') === 'username' && el.value.trim() !== '' && !el.disabled,
    ) ?? null
  )
}

/**
 * The new-password form that `field` belongs to, or `null` for a sign-in. `field` is a password
 * field or another field of the same form (the e-mail address of a sign-up). The current password
 * of a change form is part of the result; the caller fills a saved login into it.
 */
export function newPasswordForm(
  field: HTMLInputElement,
  root: Document = field.ownerDocument,
  isVisible: Visible = layoutVisible,
): NewPasswordForm | null {
  const scope: ParentNode = field.form ?? root
  const passwords = inputs(scope).filter((el) => el.type === 'password' && usable(el, isVisible))
  const [a, b, c] = passwords
  if (!a) return null
  if (field.type === 'password' && !passwords.includes(field)) return null
  const form = (
    password: HTMLInputElement,
    confirm: HTMLInputElement | null,
    current: HTMLInputElement | null,
  ): NewPasswordForm => ({
    password,
    confirm,
    current,
    username: usernameOf(password, isVisible),
    change: current !== null,
  })
  const isConfirm = (el: HTMLInputElement) => CONFIRM.test(labelOf(el))
  const pageSaysNew = () => {
    const headings = headingText(a, root, isVisible)
    return NEW_TEXT.test(headings) || (SIGN_UP.test(headings) && !SIGN_IN.test(headings))
  }
  if (c) {
    // Current, new and repeat: by their names, else in this order.
    const current = passwords.find(isCurrent) ?? a
    const rest = passwords.filter((el) => el !== current)
    const next = rest.find((el) => !isConfirm(el)) ?? rest[0]
    const again = rest.find((el) => el !== next) ?? null
    return next ? form(next, again, current) : null
  }
  if (b) {
    if (isCurrent(a) && isCurrent(b)) return null
    if (isCurrent(a)) return form(b, null, a)
    if (isCurrent(b)) return form(a, null, b)
    // Two fields where the second repeats the first: a sign-up or a reset. Two secret fields of
    // a sign-in (a password and a PIN) say nothing of the kind.
    if (isConfirm(b) || isNew(a) || isNew(b) || pageSaysNew()) return form(a, b, null)
    return null
  }
  if (isCurrent(a)) return null
  return isNew(a) || pageSaysNew() ? form(a, null, null) : null
}

/** A sign-up address: `/signup/username`, `/register`, `/create-account`. */
const SIGN_UP_PATH = /sign-?up|regist|create-?account|new-?account/i

/**
 * A sign-up step that only chooses a user name (Google's "Choose your Gmail address"): no
 * password field on the page, and its address or its headings say sign-up. The name is a new one,
 * so the Nodkey button offers no saved login there; the name goes on to the password step.
 */
export function signUpNameStep(
  field: HTMLInputElement,
  root: Document = field.ownerDocument,
  isVisible: Visible = layoutVisible,
): boolean {
  if (field.type === 'password') return false
  if (inputs(root).some((el) => el.type === 'password' && usable(el, isVisible))) return false
  if (SIGN_UP_PATH.test(root.defaultView?.location.pathname ?? '')) return true
  const shown = Array.from(root.querySelectorAll(HEADINGS))
    .filter((h) => h instanceof HTMLElement && isVisible(h))
    .map((h) => plainText(h))
  const headings = `${root.title} ${shown.join(' ')}`
  return SIGN_UP.test(headings) && !SIGN_IN.test(headings)
}

/** The longest `passwordrules` and `pattern` the protocol takes (`MAX_RULES`, `MAX_PATTERN`). */
const MAX_RULES = 300

/** The page's rules for the new password: `passwordrules`, `minlength`, `maxlength`, `pattern`. */
export function rulesOf(form: NewPasswordForm): PasswordRules {
  const fields = [form.password, form.confirm].filter((el): el is HTMLInputElement => el !== null)
  const rules: PasswordRules = {}
  const attr = (name: string) =>
    fields
      .map((el) => el.getAttribute(name)?.trim() ?? '')
      .find((v) => v !== '' && v.length <= MAX_RULES)
  const passwordrules = attr('passwordrules')
  if (passwordrules) rules.passwordrules = passwordrules
  const min = fields.map((el) => el.minLength).find((n) => n > 0)
  if (min !== undefined) rules.min_length = min
  const max = fields.map((el) => el.maxLength).find((n) => n > 0)
  if (max !== undefined) rules.max_length = max
  const pattern = attr('pattern')
  if (pattern) rules.pattern = pattern
  return rules
}

/** The first new-password form of the page, for a fill after the page drew its form again. */
export function findNewPassword(
  root: Document,
  isVisible: Visible = layoutVisible,
): NewPasswordForm | null {
  for (const el of inputs(root)) {
    if (el.type !== 'password' || !usable(el, isVisible)) continue
    const form = newPasswordForm(el, root, isVisible)
    if (form) return form
  }
  return null
}
