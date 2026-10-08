import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { encodeCursor } from '@/lib/cursor'
import {
  CURSOR_MAX_LIMIT,
  cursorPageSchema,
  cursorQuerySchema,
  idSchema,
  MAX_PER_PAGE,
  pageQuerySchema,
  pageSchema,
  toCursorPage,
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
    expect(idSchema.parse('2147483647')).toBe(2147483647)
    expect(idSchema.safeParse('2147483648').success).toBe(false)
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

describe('cursorQuerySchema', () => {
  it('defaults the limit, coerces query strings and keeps the cursor opaque', () => {
    expect(cursorQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(cursorQuerySchema.parse({ cursor: 'abc', limit: '5' })).toEqual({
      cursor: 'abc',
      limit: 5,
    })
  })

  it('rejects a limit outside 1 to 50 and a cursor over 64 characters', () => {
    for (const input of [
      { limit: '0' },
      { limit: String(CURSOR_MAX_LIMIT + 1) },
      { limit: '1.5' },
      { limit: 'abc' },
      { cursor: 'a'.repeat(65) },
    ]) {
      expect(cursorQuerySchema.safeParse(input).success).toBe(false)
    }
    expect(cursorQuerySchema.safeParse({ limit: '50' }).success).toBe(true)
  })
})

describe('toCursorPage', () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('drops the extra row and points the cursor at the last kept one', () => {
    expect(toCursorPage(rows, 2)).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      nextCursor: encodeCursor(2),
    })
  })

  it('has no next cursor when the rows fit', () => {
    expect(toCursorPage(rows, 3)).toEqual({ items: rows, nextCursor: null })
    expect(toCursorPage([], 3)).toEqual({ items: [], nextCursor: null })
  })

  it('round trips through cursorPageSchema', () => {
    const schema = cursorPageSchema(z.object({ id: z.number() }))
    const page = toCursorPage(rows, 2)
    expect(schema.parse(JSON.parse(JSON.stringify(page)))).toEqual(page)
  })
})
