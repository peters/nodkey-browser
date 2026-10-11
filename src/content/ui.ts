/**
 * Nodkey's elements inside a page: the button in a sign-in field, the status card and the save
 * question. They live in a closed shadow root, so the page's styles cannot change them and its
 * scripts cannot reach in.
 */

import type { Activity, SaveOffer } from '../models/messages'
import { t } from '../i18n/t'

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g transform="rotate(-20 32 32)"><rect x="30" y="27.5" width="25" height="9" rx="4.5" fill="currentColor"/><rect x="45" y="33" width="6" height="10" rx="3" fill="currentColor"/><circle cx="23" cy="32" r="13" fill="#ff7a59"/><path d="M17 32.5l4.2 4.2 8-8.4" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`

const CSS = `
:host { all: initial; }
.root {
  --bg: #fbfaf7; --card: #ffffff; --ink: #1d2433; --muted: #5f6878; --rule: #e3e6ea;
  --accent: #138a63; --on-accent: #ffffff; --soft: #d8f3e6; --low: #d9480f; --tile: #c8efd9;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
}
@media (prefers-color-scheme: dark) {
  .root {
    --bg: #11141a; --card: #1a1f27; --ink: #eef1f5; --muted: #9aa3b2; --rule: #2a303a;
    --accent: #5fd3a5; --on-accent: #052016; --soft: #123628; --low: #ff9466; --tile: #17402f;
  }
}
.key {
  position: fixed; width: 28px; height: 28px; padding: 3px; border: 0; border-radius: 8px;
  background: var(--tile); color: #1d2433; cursor: pointer; pointer-events: auto;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}
.key svg { width: 100%; height: 100%; display: block; }
.key:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.card {
  position: fixed; top: 16px; right: 16px; width: min(340px, calc(100vw - 32px));
  box-sizing: border-box; padding: 14px 16px; border-radius: 20px; background: var(--card);
  border: 1px solid var(--rule); box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.35);
  pointer-events: auto; display: grid; gap: 10px;
}
.head { display: flex; align-items: center; gap: 10px; }
.mark { width: 30px; height: 30px; flex: none; padding: 3px; border-radius: 9px; background: var(--tile); color: #1d2433; box-sizing: border-box; }
.mark svg { width: 100%; height: 100%; display: block; }
.title { font-weight: 700; font-size: 15px; flex: 1; }
.text { margin: 0; color: var(--ink); }
.muted { margin: 0; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
button.primary, button.plain {
  font: 600 14px/1 system-ui, sans-serif; min-height: 44px; padding: 0 16px; border-radius: 12px;
  cursor: pointer; border: 1px solid var(--rule);
}
button.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
button.plain { background: transparent; color: var(--accent); }
button.close {
  width: 44px; height: 44px; margin: -10px -12px -10px 0; border: 0; background: transparent;
  color: var(--muted); font-size: 22px; cursor: pointer; border-radius: 12px;
}
.spinner {
  width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid var(--rule);
  border-top-color: var(--accent); animation: spin 0.9s linear infinite; flex: none;
}
.error .text { color: var(--low); }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; border-top-color: var(--accent); } }
`

export class PageUi {
  private readonly root: HTMLDivElement
  private key: HTMLButtonElement | null = null
  private keyTarget: HTMLInputElement | null = null
  /** The element the button sits by: the field, or the last box of a row of code boxes. */
  private keyAnchor: HTMLElement | null = null
  private card: HTMLDivElement | null = null
  private hideTimer = 0

  constructor(private readonly onKey: (field: HTMLInputElement) => void) {
    const host = document.createElement('nodkey-ui')
    host.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block'
    const shadow = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = CSS
    this.root = document.createElement('div')
    this.root.className = 'root'
    shadow.append(style, this.root)
    document.documentElement.append(host)
    const place = () => {
      this.placeKey()
    }
    window.addEventListener('scroll', place, { passive: true, capture: true })
    window.addEventListener('resize', place, { passive: true })
  }

  /**
   * Shows the Nodkey button inside the right edge of `anchor` (the field itself), or just right of
   * it when it is too narrow, as one box of a row of code boxes is.
   */
  showKey(field: HTMLInputElement, anchor: HTMLElement = field): void {
    if (!this.key) {
      const key = document.createElement('button')
      key.type = 'button'
      key.className = 'key'
      key.innerHTML = LOGO
      key.title = t('fieldButton')
      key.setAttribute('aria-label', t('fieldButton'))
      // Keep the field focused while the button is pressed.
      key.addEventListener('mousedown', (e) => {
        e.preventDefault()
      })
      key.addEventListener('click', (e) => {
        if (e.isTrusted && this.keyTarget) this.onKey(this.keyTarget)
      })
      this.root.append(key)
      this.key = key
    }
    this.keyTarget = field
    this.keyAnchor = anchor
    this.key.hidden = false
    this.placeKey()
  }

  hideKey(): void {
    if (this.key) this.key.hidden = true
    this.keyTarget = null
    this.keyAnchor = null
  }

  private placeKey(): void {
    if (!this.key || !this.keyAnchor || this.key.hidden) return
    const r = this.keyAnchor.getBoundingClientRect()
    if (r.height < 18) {
      this.key.hidden = true
      return
    }
    const inside = r.width >= 60
    const size = inside ? Math.min(28, Math.max(20, r.height - 8)) : 28
    this.key.style.width = `${size}px`
    this.key.style.height = `${size}px`
    this.key.style.left = `${inside ? r.right - size - 6 : r.right + 8}px`
    this.key.style.top = `${r.top + (r.height - size) / 2}px`
  }

  private newCard(label: string, className = ''): HTMLDivElement {
    this.card?.remove()
    window.clearTimeout(this.hideTimer)
    const card = document.createElement('div')
    card.className = `card ${className}`
    card.setAttribute('aria-label', label)
    const head = document.createElement('div')
    head.className = 'head'
    const mark = document.createElement('div')
    mark.className = 'mark'
    mark.innerHTML = LOGO
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = t('extName')
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'close'
    close.textContent = '×'
    close.setAttribute('aria-label', t('close'))
    close.addEventListener('click', () => {
      this.closeCard()
    })
    head.append(mark, title, close)
    card.append(head)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeCard()
    })
    this.root.append(card)
    this.card = card
    return card
  }

  closeCard(): void {
    this.card?.remove()
    this.card = null
  }

  /** The state of the latest request for this page. */
  showActivity(a: Activity): void {
    const card = this.newCard(t('extName'), a.state === 'error' ? 'error' : '')
    card.setAttribute('role', 'status')
    card.setAttribute('aria-live', 'polite')
    const line = document.createElement('div')
    line.className = 'head'
    if (a.state === 'waiting') {
      const spin = document.createElement('div')
      spin.className = 'spinner'
      line.append(spin)
    }
    const text = document.createElement('p')
    text.className = 'text'
    text.textContent = a.message
    line.append(text)
    card.append(line)
    if (a.state === 'waiting') {
      const hint = document.createElement('p')
      hint.className = 'muted'
      hint.textContent = t('actWaitingHint')
      card.append(hint)
    } else {
      this.hideTimer = window.setTimeout(() => {
        this.closeCard()
      }, 8000)
    }
  }

  /** Asks whether to save the login the person just used. */
  askSave(offer: SaveOffer, answer: (choice: 'save' | 'later' | 'never') => void): void {
    const card = this.newCard(t('saveAsk', offer.site))
    card.setAttribute('role', 'dialog')
    const question = document.createElement('p')
    question.className = 'text'
    question.textContent = t('saveAsk', offer.site)
    const user = document.createElement('p')
    user.className = 'muted'
    user.textContent = offer.username
    const row = document.createElement('div')
    row.className = 'row'
    const button = (label: string, cls: string, choice: 'save' | 'later' | 'never') => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = cls
      b.textContent = label
      b.addEventListener('click', (e) => {
        if (!e.isTrusted) return
        this.closeCard()
        answer(choice)
      })
      return b
    }
    const save = button(t('saveSave'), 'primary', 'save')
    row.append(
      save,
      button(t('saveNotNow'), 'plain', 'later'),
      button(t('saveNever'), 'plain', 'never'),
    )
    card.append(question, user, row)
    // A dialog takes the focus, so a keyboard user can answer at once (Escape closes it).
    save.focus({ preventScroll: true })
  }
}
