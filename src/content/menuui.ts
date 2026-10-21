/** The menu of the Nodkey button in a field for a new password: its look and its keys. */

import { t } from '../i18n/t'

/** One choice in the menu of the Nodkey button. */
export interface MenuItem {
  label: string
  /** A second, quieter line. */
  detail?: string
  run: () => void
}

export const menuCss = `
.menu {
  position: fixed; width: 280px; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 6px; border-radius: 16px;
  background: var(--card); border: 1px solid var(--rule); box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.35);
  pointer-events: auto; display: grid; gap: 2px;
}
.menu button {
  font: 600 14px/1.25 system-ui, sans-serif; min-height: 44px; padding: 8px 12px; border: 0;
  border-radius: 11px; background: transparent; color: var(--ink); text-align: left; cursor: pointer;
  display: grid; gap: 2px;
}
.menu button:hover, .menu button:focus-visible { background: var(--soft); outline: none; }
.menu button.first { color: var(--accent); }
.menu .detail { font-weight: 400; font-size: 12.5px; color: var(--muted); }
`

/**
 * Makes the menu: one button for each item, the first one in the accent color. Arrow keys move
 * between the items; Escape calls `close`. `choose` gets a trusted click on an item.
 */
export function buildMenu(
  items: MenuItem[],
  choose: (item: MenuItem, e: MouseEvent) => void,
  close: () => void,
): { menu: HTMLDivElement; first: HTMLButtonElement | undefined } {
  const menu = document.createElement('div')
  menu.className = 'menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', t('extName'))
  const buttons = items.map((item, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'menuitem')
    if (i === 0) b.className = 'first'
    const label = document.createElement('span')
    label.textContent = item.label
    b.append(label)
    if (item.detail) {
      const detail = document.createElement('span')
      detail.className = 'detail'
      detail.textContent = item.detail
      b.append(detail)
    }
    b.addEventListener('click', (e) => {
      if (e.isTrusted) choose(item, e)
    })
    return b
  })
  menu.addEventListener('keydown', (e) => {
    const at = buttons.findIndex((b) => b.matches(':focus'))
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : buttons.length - 1
      buttons[(at + step) % buttons.length]?.focus()
    }
  })
  menu.append(...buttons)
  return { menu, first: buttons[0] }
}
