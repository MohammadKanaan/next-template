import { z } from 'zod'

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

export type Permissions = z.infer<typeof permissionsSchema>

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
