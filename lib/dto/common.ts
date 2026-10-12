import { z } from 'zod'

export const DEFAULT_PER_PAGE = 10
export const MAX_PER_PAGE = 100
/** Caps `page` so unauthenticated callers cannot mint unbounded cache keys and deep OFFSET scans. */
export const MAX_PAGE = 1000

/**
 * A record id. Ids are UUID columns, so anything else would make PostgreSQL throw: a read treats
 * it as not found, a write reports it as a validation error.
 */
export const idSchema = z.uuid('Invalid id')

export const sortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof sortDirectionSchema>

/** `true` / `false` as a boolean or as the string a query string carries (never `z.coerce.boolean()`, which reads `'false'` as true). */
export const booleanParamSchema = z.union([z.boolean(), z.stringbool()])

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(MAX_PAGE).default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
})

export type PageQuery = z.infer<typeof pageQuerySchema>

/** What the viewer may do with a record; the DAL computes it per viewer and never caches it. */
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
