import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { idSchema, MAX_PER_PAGE, pageQuerySchema, pageSchema, toPage } from '@/lib/dto/common'

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
      { perPage: MAX_PER_PAGE + 1 },
    ]) {
      expect(pageQuerySchema.safeParse(input).success).toBe(false)
    }
  })
})

describe('idSchema', () => {
  it('accepts positive integer strings only', () => {
    expect(idSchema.parse('7')).toBe(7)
    expect(idSchema.safeParse('abc').success).toBe(false)
    expect(idSchema.safeParse('1.5').success).toBe(false)
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
})
