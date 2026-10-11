import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  booleanParamSchema,
  idSchema,
  MAX_PAGE,
  MAX_PER_PAGE,
  pageQuerySchema,
  pageSchema,
  toPage,
} from '@/lib/dto/common'

describe('pageQuerySchema', () => {
  it('defaults missing values and coerces query strings', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, perPage: 10 })
    expect(pageQuerySchema.parse({ page: '3', perPage: '5' })).toEqual({ page: 3, perPage: 5 })
  })

  it('rejects zero, negatives, non-numbers, and oversized pages', () => {
    for (const input of [
      { page: '0' },
      { page: '-1' },
      { page: 'abc' },
      { page: String(MAX_PAGE + 1) },
      { perPage: MAX_PER_PAGE + 1 },
    ]) {
      expect(pageQuerySchema.safeParse(input).success, JSON.stringify(input)).toBe(false)
    }
    expect(pageQuerySchema.parse({ page: String(MAX_PAGE) }).page).toBe(MAX_PAGE)
  })
})

describe('idSchema', () => {
  it('accepts positive integer strings only', () => {
    expect(idSchema.parse('7')).toBe(7)
    expect(idSchema.parse(7)).toBe(7)
    expect(idSchema.safeParse('abc').success).toBe(false)
    expect(idSchema.safeParse('1.5').success).toBe(false)
    expect(idSchema.safeParse('0').success).toBe(false)
    expect(idSchema.safeParse(-1).success).toBe(false)
    expect(idSchema.parse('2147483647')).toBe(2147483647)
    expect(idSchema.safeParse('2147483648').success).toBe(false)
  })
})

describe('booleanParamSchema', () => {
  it('accepts a boolean as it is', () => {
    expect(booleanParamSchema.parse(true)).toBe(true)
    expect(booleanParamSchema.parse(false)).toBe(false)
  })

  it('reads the strings a query string carries', () => {
    expect(booleanParamSchema.parse('true')).toBe(true)
    // `z.coerce.boolean()` would read this as true.
    expect(booleanParamSchema.parse('false')).toBe(false)
  })

  it('rejects anything else', () => {
    for (const input of ['maybe', '', 1, 0, null, undefined]) {
      expect(booleanParamSchema.safeParse(input).success, String(input)).toBe(false)
    }
  })
})

describe('toPage', () => {
  it('computes total pages and never reports zero pages', () => {
    expect(toPage(['a', 'b'], 5, { page: 1, perPage: 2 })).toEqual({
      items: ['a', 'b'],
      page: 1,
      perPage: 2,
      totalItems: 5,
      totalPages: 3,
    })
    expect(toPage([], 0, { page: 1, perPage: 10 }).totalPages).toBe(1)
  })

  it('round-trips through pageSchema', () => {
    const page = toPage([1, 2], 2, { page: 1, perPage: 10 })
    expect(pageSchema(z.number()).parse(page)).toEqual(page)
  })

  it('rejects a page whose items do not match', () => {
    const page = toPage(['a'], 1, { page: 1, perPage: 10 })
    expect(pageSchema(z.number()).safeParse(page).success).toBe(false)
  })
})
