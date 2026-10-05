import type { Scalars } from '@prisma/orm-postgres/family-contract/types'
import type { Models } from '@/prisma/contract'

/** Row types as the Prisma 8 ORM returns them (timestamps are Postgres text). */
export type UserRow = Scalars<Models.public_User>
export type PostRow = Scalars<Models.public_Post>
export type PostWithUserRow = PostRow & { user: UserRow }

/** Postgres `timestamptz` text (e.g. `2026-10-05 14:02:46.25+03`) to an ISO 8601 string. */
export function toIsoString(value: string) {
  return new Date(value).toISOString()
}
