/** Puts values into page fields the way typing would, so page scripts (React, Vue, ...) see them. */

export function setValue(el: HTMLInputElement, value: string): void {
  el.focus()
  // The prototype's setter, so frameworks that track the field's own setter notice the change.
  if (!Reflect.set(HTMLInputElement.prototype, 'value', value, el)) el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Fills a code into one field, or one digit per box. */
export function fillCode(fields: HTMLInputElement[], code: string): boolean {
  const digits = code.replace(/\s+/g, '')
  if (fields.length === 1 && fields[0]) {
    setValue(fields[0], digits)
    return true
  }
  if (fields.length < digits.length) return false
  digits.split('').forEach((d, i) => {
    const box = fields[i]
    if (box) setValue(box, d)
  })
  return true
}
