import { describe, expect, it } from 'vitest'
import { formatMoney, moneyInputSchema } from '@/lib/money'

describe('moneyInputSchema', () => {
  it.each(['0', '12', '12.5', '12.50', '0.99', '9999999999', '9999999999.99'])(
    'accepts %s',
    (value) => {
      expect(moneyInputSchema.safeParse(value).success).toBe(true)
    },
  )

  it('trims the input', () => {
    expect(moneyInputSchema.parse('  12.50 ')).toBe('12.50')
  })

  it.each(['', '-1', '+1', '1.', '.5', '1.234', '1,50', '1e3', 'abc', '12 50', '12345678901'])(
    'rejects %j',
    (value) => {
      expect(moneyInputSchema.safeParse(value).success).toBe(false)
    },
  )

  it('rejects a number, because amounts travel as strings', () => {
    expect(moneyInputSchema.safeParse(12.5).success).toBe(false)
  })
})

describe('formatMoney', () => {
  it('formats a decimal string with the currency and two decimals', () => {
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50')
    expect(formatMoney('0', 'USD')).toBe('$0.00')
    expect(formatMoney('12.05', 'EUR')).toBe('€12.05')
  })

  it('does not lose precision a float would', () => {
    expect(formatMoney('9007199254740993.99', 'USD')).toBe('$9,007,199,254,740,993.99')
  })

  it('uses the given locale', () => {
    expect(formatMoney('1234.5', 'EUR', 'de-DE')).toBe('1.234,50 €')
  })
})
