import { beforeEach, describe, expect, it } from 'vitest'
import type { ToBackground } from '../models/messages'
import { fillNew, openMenu } from './generate'
import type { MenuItem } from './menuui'
import { newPasswordForm } from './newpassword'
import type { PageUi } from './ui'

const visible = () => true
const field = (id: string) => document.getElementById(id) as HTMLInputElement

/** Opens the menu of the form of `id` with a stand-in page layer; returns its items and messages. */
function menu(id: string) {
  const form = newPasswordForm(field(id), document, visible)
  if (!form) throw new Error('no new-password form')
  const items: MenuItem[] = []
  const ui = { showMenu: (list: MenuItem[]) => items.push(...list) } as unknown as PageUi
  const sent: (ToBackground | 'saved login')[] = []
  const send = <T>(msg: ToBackground) => {
    sent.push(msg)
    return Promise.resolve(null as T | null)
  }
  openMenu(form, ui, send, () => sent.push('saved login'))
  return { items, sent }
}

describe('make a strong password', () => {
  beforeEach(() => {
    document.title = 'Example Cloud: create your account'
    document.body.innerHTML = `<form><input id="e" type="email" value=" new.alex@example.com ">
      <input id="p" type="password" autocomplete="new-password" minlength="12"
        passwordrules="minlength: 12; required: lower; required: digit;">
      <input id="c" type="password" autocomplete="new-password"></form>`
  })

  it('offers to make a password first and a saved login second', () => {
    // Nothing asked in this frame yet: nothing is filled.
    expect(fillNew({ type: 'fill.new', site: 'localhost', password: 'Synthetic-0' })).toBe(false)
    const { items, sent } = menu('p')
    expect(items.map((i) => i.label)).toEqual(['Make a strong password', 'Use a saved login'])
    items[1]?.run()
    expect(sent).toEqual(['saved login'])
  })

  it('sends the user name, the title and the rules of the page', () => {
    const { items, sent } = menu('p')
    items[0]?.run()
    expect(sent).toEqual([
      {
        type: 'generate',
        username: 'new.alex@example.com',
        title: 'Example Cloud: create your account',
        change: false,
        rules: {
          passwordrules: 'minlength: 12; required: lower; required: digit;',
          min_length: 12,
        },
      },
    ])
  })

  it('fills the new password and its repeat field once, only on the site that answered', () => {
    menu('p').items[0]?.run()
    // An answer for another site is not filled here.
    expect(fillNew({ type: 'fill.new', site: 'example.org', password: 'Synthetic-1' })).toBe(false)
    expect(fillNew({ type: 'fill.new', site: 'localhost', password: 'Synthetic-1' })).toBe(true)
    expect([field('p').value, field('c').value]).toEqual(['Synthetic-1', 'Synthetic-1'])
    expect(field('e').value.trim()).toBe('new.alex@example.com')
    expect(fillNew({ type: 'fill.new', site: 'localhost', password: 'Synthetic-2' })).toBe(false)
  })

  it('puts the user name from the phone into an empty user name field', () => {
    field('e').value = ''
    menu('c').items[0]?.run()
    const msg = { type: 'fill.new', site: 'localhost', password: 'Synthetic-3' } as const
    expect(fillNew({ ...msg, username: 'alex.typed@example.com' })).toBe(true)
    expect(field('e').value).toBe('alex.typed@example.com')
  })

  it('puts the user name that the person corrected on the phone into the form', () => {
    menu('p').items[0]?.run()
    const msg = { type: 'fill.new', site: 'localhost', password: 'Synthetic-4' } as const
    expect(fillNew({ ...msg, username: 'alex.k@example.com' })).toBe(true)
    expect(field('e').value).toBe('alex.k@example.com')
    expect([field('p').value, field('c').value]).toEqual(['Synthetic-4', 'Synthetic-4'])
  })
})
