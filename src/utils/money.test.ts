import { describe, expect, it } from 'vitest'
import { exceeds, formatMoney, thousandths } from './money'

describe('money', () => {
  it('compares amounts with different decimals', () => {
    expect(thousandths('499.5')).toBe(499_500)
    expect(thousandths('12.345')).toBe(12_345)
    expect(thousandths('1 000')).toBeNull()
    const nok = (value: string) => ({ value, currency: 'NOK' })
    expect(exceeds(nok('500'), nok('499.99'))).toBe(true)
    expect(exceeds(nok('499.990'), nok('499.99'))).toBe(false)
    expect(exceeds({ value: '1', currency: 'EUR' }, nok('9'))).toBe(true)
    expect(exceeds(nok('x'), nok('9'))).toBe(true)
  })

  it('shows amounts in the person language', () => {
    expect(formatMoney({ value: '499.00', currency: 'NOK' }, 'nb')).toMatch(/499,00/)
    expect(formatMoney({ value: '1234.5', currency: 'USD' }, 'en-US')).toBe('$1,234.50')
    expect(formatMoney({ value: '5', currency: 'XYZW' }, 'en')).toBe('5 XYZW')
  })
})
