/**
 * What a click or an Enter key in a page really submits. A click in a picker (a custom select, a
 * listbox, a menu, a tab, a switch, a radio button), on a button that opens something, or on the
 * button that shows a password is not a submit: a country picker far down a checkout page must
 * never send the card of the page to the phone. The `submit` event of the page stays the strongest
 * sign; these functions cover the pages that submit from a script.
 *
 * Pure DOM logic, tested with jsdom.
 */

/** The roles of a widget that picks a value or opens a list: never a submit. */
const PICKER_ROLES = new Set([
  'combobox',
  'listbox',
  'option',
  'menu',
  'menuitem',
  'menuitemradio',
  'tab',
  'switch',
  'checkbox',
  'radio',
])

/** The words of a submit in the languages of the iPhone app (and the two forms of Chinese). */
const SUBMIT_WORDS = new Set([
  // en
  'log in',
  'login',
  'sign in',
  'signin',
  'sign up',
  'signup',
  'continue',
  'next',
  'submit',
  'send',
  'pay',
  'buy',
  'purchase',
  'place order',
  'order now',
  'confirm',
  'save',
  // nb
  'logg inn',
  'logge inn',
  'logg på',
  'fortsett',
  'neste',
  'send inn',
  'betal',
  'bestill',
  'kjøp',
  'bekreft',
  'lagre',
  'gå videre',
  'fullfør',
  // da
  'log ind',
  'fortsæt',
  'næste',
  'indsend',
  'bestil',
  'køb',
  'bekræft',
  'gem',
  'udfør',
  'gå videre',
  // sv
  'logga in',
  'fortsätt',
  'nästa',
  'skicka',
  'betala',
  'beställ',
  'köp',
  'bekräfta',
  'spara',
  'gå vidare',
  // de
  'anmelden',
  'einloggen',
  'weiter',
  'absenden',
  'abschicken',
  'bezahlen',
  'zahlen',
  'bestellen',
  'kaufen',
  'bestätigen',
  'speichern',
  // es
  'iniciar sesión',
  'entrar',
  'continuar',
  'siguiente',
  'enviar',
  'pagar',
  'comprar',
  'confirmar',
  'guardar',
  'aceptar',
  // fr
  'se connecter',
  'connexion',
  'continuer',
  'suivant',
  'envoyer',
  'payer',
  'acheter',
  'confirmer',
  'enregistrer',
  'valider',
  'terminer',
  // it
  'accedi',
  'continua',
  'avanti',
  'invia',
  'paga',
  'acquista',
  'conferma',
  'salva',
  'procedi',
  // pt-BR
  'próximo',
  'proximo',
  'salvar',
  'aceitar',
  // ja
  'ログイン',
  'サインイン',
  '次へ',
  '続ける',
  '送信',
  '支払う',
  '購入',
  '確認',
  '保存',
  '決定',
  // ko
  '로그인',
  '다음',
  '계속',
  '제출',
  '결제',
  '구매',
  '확인',
  '저장',
  '완료',
  // zh-Hans
  '登录',
  '登入',
  '下一步',
  '继续',
  '提交',
  '支付',
  '购买',
  '确认',
])

/** The words above that are about a password, not about a submit. */
const PASSWORD_WORDS = new Set([
  'show',
  'hide',
  'reveal',
  'display',
  'vis',
  'vise',
  'skjul',
  'skjule',
  'visa',
  'dölj',
  'anzeigen',
  'verbergen',
  'zeigen',
  'einblenden',
  'ausblenden',
  'mostrar',
  'ocultar',
  'afficher',
  'masquer',
  'mostra',
  'nascondi',
  'exibir',
  'esconder',
  '表示',
  '非表示',
  '숨기기',
  '显示',
  '隐藏',
])

/** Scripts written without spaces between words: a word inside the text counts. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/

/** The text of a control as a person reads it: its `aria-label`, else its text or its value. */
function textOf(control: Element): string {
  const aria = control.getAttribute('aria-label')
  if (aria && aria.trim()) return aria
  if (control instanceof HTMLInputElement) return control.value
  return control.textContent
}

/** The text without the decoration of a button: one space between words, punctuation aside. */
function tidy(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2190-\u21ff\u2026«»‹›→:;!?.|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function holds(text: string, word: string): boolean {
  if (CJK.test(word)) return text.includes(word)
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text)
}

/** True when the text holds one of the words: a whole word, or a part of a word in a CJK script. */
function matchers(words: Iterable<string>): ((text: string) => boolean)[] {
  return [...words].map((word) => (text: string) => holds(text, word))
}

const SUBMIT_MATCHERS = matchers(SUBMIT_WORDS)
const PASSWORD_MATCHERS = matchers(PASSWORD_WORDS)

/** True for the text of a button that submits, and false for one that shows a password. */
function isSubmitText(text: string): boolean {
  const tidyText = tidy(text)
  if (!tidyText) return false
  if (PASSWORD_MATCHERS.some((hit) => hit(tidyText))) return false
  return SUBMIT_MATCHERS.some((hit) => hit(tidyText))
}

/** True for an element or an attribute of a widget that opens a list or picks a value. */
function opensSomething(node: Element): boolean {
  const role = (node.getAttribute('role') ?? '').trim().toLowerCase()
  if (PICKER_ROLES.has(role)) return true
  const popup = (node.getAttribute('aria-haspopup') ?? '').trim().toLowerCase()
  if (popup && popup !== 'false') return true
  return node.hasAttribute('aria-expanded') || node.hasAttribute('aria-pressed')
}

/** True when `el` or an ancestor up to its form (or the body) is a picker, not a submit. */
function inPicker(el: Element): boolean {
  const stop = el.closest('form') ?? el.ownerDocument.body
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (opensSomething(node)) return true
    if (node === stop) break
  }
  return false
}

/**
 * Whether a click on `target` (or on something inside it) submits the form: a submit button, an
 * image button, a button of the form, or a button whose text says that it submits. A picker, a
 * menu, a tab, a switch, a radio button and a "Show password" button never submit.
 */
export function isSubmitClick(target: Element): boolean {
  const control = target.closest('button, input')
  if (!control) return false
  if (inPicker(control)) return false
  if (control instanceof HTMLButtonElement) {
    const type = (control.getAttribute('type') ?? '').trim().toLowerCase()
    if (type === 'submit') return true
    if (!type && control.closest('form')) return true
    return isSubmitText(textOf(control))
  }
  if (!(control instanceof HTMLInputElement)) return false
  const type = (control.getAttribute('type') ?? '').trim().toLowerCase()
  if (type === 'submit' || type === 'image') return true
  if (type === 'button' || type === 'reset') return isSubmitText(textOf(control))
  return false
}

/**
 * Whether Enter in `input` submits: not in a field that searches or picks a value (a combobox, an
 * autocomplete, a list of suggestions), and yes in every other field.
 */
export function isSubmitEnter(input: HTMLInputElement): boolean {
  const role = (input.getAttribute('role') ?? '').trim().toLowerCase()
  if (role === 'combobox') return false
  if (input.hasAttribute('aria-autocomplete')) return false
  if (input.hasAttribute('aria-expanded')) return false
  const popup = (input.getAttribute('aria-haspopup') ?? '').trim().toLowerCase()
  if (popup && popup !== 'false') return false
  if (input.hasAttribute('list')) return false
  if (input.type === 'search') return false
  for (let node = input.parentElement; node; node = node.parentElement) {
    const above = (node.getAttribute('role') ?? '').trim().toLowerCase()
    if (above === 'combobox' || above === 'listbox') return false
  }
  return true
}
