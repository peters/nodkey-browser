/**
 * Finds what a sign-in page offers besides a password: the "Sign in with <provider>" buttons, a
 * second step that waits for a tap on another phone ("Check your phone") with its "Try another
 * way" link, the ways to sign in that such a link shows, and a page that asks for a code sent by
 * SMS. Pure DOM logic with text patterns, tested with jsdom; `isVisible` comes from the caller.
 */

import type { SecondStep } from '../models/protocol'
import { type Visible, layoutVisible } from './forms'

export const PROVIDER_NAMES: readonly (readonly [string, RegExp])[] = [
  ['google', /\bgoogle\b/i],
  ['apple', /\bapple\b/i],
  ['github', /\bgithub\b/i],
  ['microsoft', /\bmicrosoft\b/i],
  ['facebook', /\bfacebook\b/i],
]

/** "Sign in with", "Continue with" and the same in the twelve languages of the app. */
const SIGN_IN_WITH =
  /\b(sign|log)\s?(in|on|up)\s+(with|using|via)\b|\bcontinue\s+with\b|logg?\s?inn\s+med|fortsett\s+med|logga\s+in\s+med|forts[äa]tt\s+med|log\s+ind\s+med|forts[æa]t\s+med|anmelden\s+mit|weiter\s+mit|se\s+connecter\s+avec|continuer\s+avec|iniciar\s+sesi[óo]n\s+con|continuar\s+con|accedi\s+con|continua\s+con|entrar\s+com|continuar\s+com|でログイン|で続行|로\s?로그인|계속하기|登录|继续/i

/** The provider's own sign-in paths, for links that only show a logo. */
const PROVIDER_LINK =
  /accounts\.google\.com|appleid\.apple\.com|github\.com\/login|login\.microsoftonline\.com|login\.live\.com|facebook\.com\/(v[\d.]+\/)?dialog\/oauth/i

/** A phone prompt of a second step, in English and the other languages of the app. */
const PHONE_PROMPT =
  /check your (phone|device)|tap yes|approve (the )?(sign-in|request) on your|open the .{1,30} app on your phone|sjekk (telefonen|mobilen)|trykk (på )?ja|kontrollera (din )?telefon|tryck på ja|tjek din telefon|tryk på ja|prüfen sie ihr (telefon|smartphone)|tippen sie auf ja|vérifiez votre téléphone|appuyez sur oui|revisa tu teléfono|toca sí|controlla il (tuo )?telefono|tocca sì|verifique seu (telefone|celular)|toque em sim|スマートフォンを確認|휴대전화를 확인|查看您的手机/i

/** The link away from the phone prompt. */
const ANOTHER_WAY =
  /try another way|(sign|log) in another way|use another (method|way)|other ways to (sign|log) in|more ways to (sign|log) in|choose another (method|way)|prøv en annen måte|logg (inn|på) på en annen måte|försök på ett annat sätt|prøv en anden måde|andere (methode|möglichkeit)|essayer une autre méthode|probar otra (manera|forma)|prova (un )?altro (metodo|modo)|tentar de outra (forma|maneira)|別の方法|다른 방법|其他方式/i

/** A page that says the site sent a code by SMS. */
const SMS_SENT =
  /\b(sent|texted)\b.{0,60}\b(text message|sms)\b|\b(text message|sms)\b.{0,40}\b(code|sent)\b|we texted|tekstmelding|per sms|par sms|por sms|via sms|tramite sms|textmeddelande|sms[- ]?(kode|code|kod|código|codice)/i

/** How each way to sign in is named in a list of choices. The first match wins. */
const STEP_TEXT: readonly (readonly [SecondStep, RegExp])[] = [
  [
    'passkey',
    /passkey|security key|tilgangsnøkkel|sikkerhetsnøkkel|passnyckel|adgangsnøgle|passkey|clé d'accès|llave de acceso|chiave di accesso|chave de acesso|パスキー|패스키|通行密钥/i,
  ],
  [
    'totp',
    /authenticator|code from (the |an |your )?.{0,30}\bapp\b|kode fra .{0,30}app|kod från .{0,30}app|code aus .{0,30}app|one-time code from|totp/i,
  ],
  ['email', /e-?mail|e-post|courriel|correo/i],
  [
    'sms',
    /text message|\bsms\b|tekstmelding|textmeddelande|verification code (at|to) .{0,30}\d{2}\b|code (at|to) [•*·.\s()+-]*\d{2}\b/i,
  ],
  [
    'app_prompt',
    /tap yes|on your phone|on your (other )?device|notification|trykk ja|varsel|push/i,
  ],
]

const CLICKABLE =
  'a, button, [role=button], [role=link], [role=option], [role=menuitem], li, input[type=button], input[type=submit], [data-challengetype]'

function textOf(el: Element): string {
  const own = el.textContent
  const label = [
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el instanceof HTMLInputElement ? el.value : null,
    ...Array.from(el.querySelectorAll('img[alt]'), (img) => img.getAttribute('alt')),
  ]
  return [own, ...label]
    .filter((s): s is string => !!s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shown(el: Element, isVisible: Visible): boolean {
  return el instanceof HTMLElement && isVisible(el)
}

export interface ProviderButton {
  provider: string
  element: HTMLElement
}

/** The provider of a "Sign in with <provider>" button or link, or `null`. */
export function providerOf(el: Element): string | null {
  const text = textOf(el)
  if (text.length > 80) return null
  const href = el instanceof HTMLAnchorElement ? el.href : (el.getAttribute('formaction') ?? '')
  for (const [provider, name] of PROVIDER_NAMES) {
    if (!name.test(text)) continue
    if (SIGN_IN_WITH.test(text) || PROVIDER_LINK.test(href) || text.toLowerCase() === provider) {
      return provider
    }
  }
  return null
}

/** The visible provider buttons of the page, innermost first. */
export function providerButtons(
  root: ParentNode,
  isVisible: Visible = layoutVisible,
): ProviderButton[] {
  const out: ProviderButton[] = []
  for (const el of Array.from(root.querySelectorAll('a, button, [role=button]'))) {
    const provider = providerOf(el)
    if (provider && shown(el, isVisible) && el instanceof HTMLElement) {
      out.push({ provider, element: el })
    }
  }
  return out
}

/** The provider button that `target` (a click) is in, if any. */
export function clickedProvider(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const el = target.closest('a, button, [role=button], input[type=button], input[type=submit]')
  return el ? providerOf(el) : null
}

function bodyText(root: Document): string {
  return root.body.textContent.replace(/\s+/g, ' ').slice(0, 20_000)
}

/**
 * The "Try another way" link of a phone prompt ("Check your phone", "Tap Yes"), or `null` when
 * the page shows no such prompt.
 */
export function phonePrompt(
  root: Document,
  isVisible: Visible = layoutVisible,
): HTMLElement | null {
  if (!PHONE_PROMPT.test(bodyText(root))) return null
  const links = Array.from(root.querySelectorAll(CLICKABLE)).filter(
    (el): el is HTMLElement => shown(el, isVisible) && ANOTHER_WAY.test(textOf(el)),
  )
  // The innermost element: a link inside a list item names the same way as the item.
  return links.find((el) => !links.some((o) => o !== el && el.contains(o))) ?? null
}

/** True when the page says that the site sent a code by SMS. */
export function smsPage(root: Document): boolean {
  return SMS_SENT.test(bodyText(root))
}

/** The step a choice in a list of ways to sign in stands for. */
export function stepOf(el: Element): SecondStep | null {
  const text = textOf(el)
  if (!text || text.length > 200) return null
  return STEP_TEXT.find(([, re]) => re.test(text))?.[0] ?? null
}

/**
 * The ways to sign in that the page offers now, each with the element to click: the innermost
 * clickable element for each step, except `skip` (the "Try another way" link itself).
 */
export function offeredSteps(
  root: Document,
  skip: Element | null,
  isVisible: Visible = layoutVisible,
): Map<SecondStep, HTMLElement> {
  const found = new Map<SecondStep, HTMLElement>()
  const all = Array.from(root.querySelectorAll(CLICKABLE)).filter(
    (el): el is HTMLElement =>
      shown(el, isVisible) && el !== skip && !(skip?.contains(el) ?? false),
  )
  for (const el of all) {
    if (all.some((o) => o !== el && el.contains(o) && stepOf(o) !== null)) continue
    const step = stepOf(el)
    if (step && !found.has(step)) found.set(step, el)
  }
  return found
}
