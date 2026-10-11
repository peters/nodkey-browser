import { describe, expect, it, vi } from 'vitest'
import { fillCode, setValue } from './fill'

describe('setValue', () => {
  it('sets the value and tells the page', () => {
    document.body.innerHTML = '<input id="f">'
    const el = document.getElementById('f') as HTMLInputElement
    const input = vi.fn()
    const change = vi.fn()
    el.addEventListener('input', input)
    el.addEventListener('change', change)
    setValue(el, 'alex')
    expect(el.value).toBe('alex')
    expect(input).toHaveBeenCalledOnce()
    expect(change).toHaveBeenCalledOnce()
  })
})

describe('fillCode', () => {
  it('fills one field or one digit per box', () => {
    document.body.innerHTML = '<input id="one">' + '<input maxlength="1">'.repeat(6)
    const inputs = Array.from(document.querySelectorAll('input'))
    const [one, ...boxes] = inputs
    expect(fillCode([one as HTMLInputElement], '123 456')).toBe(true)
    expect(one?.value).toBe('123456')
    expect(fillCode(boxes, '654321')).toBe(true)
    expect(boxes.map((b) => b.value).join('')).toBe('654321')
    expect(fillCode(boxes.slice(0, 3), '654321')).toBe(false)
  })
})
