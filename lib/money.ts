import { z } from 'zod'

/**
 * A money amount as it crosses every boundary: a non-negative string with at most two decimals
 * (`'12'`, `'12.5'`, `'12.50'`). Never a JS number, which cannot hold `0.10` exactly. The DAL turns
 * it into `Prisma.Decimal` and back (see `docs/guides/money-and-concurrency.md`).
 */
export const moneyInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 12 or 12.50')

/**
 * An amount for people: `formatMoney('1234.5', 'USD')` is `$1,234.50`. `Intl.NumberFormat` formats
 * the decimal string as it is, so no float is involved. The locale defaults to `en-US` so the
 * output does not depend on the server's environment.
 */
export const formatMoney = (amount: string, currency: string, locale = 'en-US') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    // A decimal string is exact; the type only accepts the `${number}` literal form of it.
    amount as `${number}`,
  )
