import 'server-only'
import type { PostModel, UserModel } from '@/types/models'

/** Row types as the Prisma 8 ORM returns them (timestamps are Postgres text). */
export type UserRow = UserModel
export type PostRow = PostModel
export type PostWithUserRow = PostRow & { user: UserRow }

/** Postgres `timestamptz` text (e.g. `2026-10-05 14:02:46.25+03`) to an ISO 8601 string. */
export function toIsoString(value: string) {
  return new Date(value).toISOString()
}
