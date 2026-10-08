import { z } from 'zod'
import { encodeCursor } from '@/lib/cursor'

export const DEFAULT_PER_PAGE = 10
export const MAX_PER_PAGE = 100
/** Caps `page` so unauthenticated callers cannot mint unbounded cache keys and deep OFFSET scans. */
export const MAX_PAGE = 1000

/** A positive Postgres `int4` id, coerced from a route param or query string. */
export const idSchema = z.coerce.number().int().positive().max(2147483647)

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(MAX_PAGE).default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
})

export type PageQuery = z.infer<typeof pageQuerySchema>

export const permissionsSchema = z.object({
  update: z.boolean(),
  delete: z.boolean(),
})

export type Page<T> = {
  items: T[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export const pageSchema = <T extends z.ZodType>(item: T) => {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    perPage: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  })
}

export const toPage = <T>(
  items: T[],
  totalItems: number,
  { page, perPage }: PageQuery,
): Page<T> => {
  return {
    items,
    page,
    perPage,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / perPage)),
  }
}

export const CURSOR_MAX_LIMIT = 50
export const CURSOR_DEFAULT_LIMIT = 20

/**
 * Query of a cursor-paginated list. A `cursor` that `decodeCursor` cannot read is not an error:
 * the list starts from its first page.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(CURSOR_MAX_LIMIT).default(CURSOR_DEFAULT_LIMIT),
})

export type CursorQuery = z.infer<typeof cursorQuerySchema>

/** A page of a feed: no totals, just where the next page starts (`null` on the last page). */
export type CursorPage<T> = {
  items: T[]
  nextCursor: string | null
}

export const cursorPageSchema = <T extends z.ZodType>(item: T) => {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })
}

/**
 * Turns `limit + 1` rows into a page: the extra row only says there is more, and the cursor is the
 * id of the last row that is kept.
 */
export const toCursorPage = <T extends { id: number }>(rows: T[], limit: number): CursorPage<T> => {
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.id) : null }
}
