import 'server-only'
import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { Prisma } from '@/generated/prisma/client'
import { toPage, type Page } from '@/lib/dto/common'
import {
  adminUserSchema,
  banUserInput,
  listUsersQuery,
  setUserRoleInput,
  userIdSchema,
  type AdminUser,
  type BanUserInput,
  type ListUsersQuery,
  type SetUserRoleInput,
} from '@/lib/dto/users'
import { auth, requireAdmin } from './auth'
import { db } from './db'
import { escapeLike } from './escapeLike'
import { ForbiddenError, NotFoundError, parseInput } from './errors'

// The admin area. Reads are this app's own queries; writes go through Better Auth's admin plugin
// (`auth.api.*`), which owns the semantics (a ban revokes the sessions, impersonation opens a
// session that remembers the admin). Both run behind `requireAdmin()`, and the plugin's HTTP
// routes are closed (`disabledPaths` in `./auth`), so this file is the one way in.

const adminUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  emailVerified: true,
  role: true,
  banned: true,
  banReason: true,
  createdAt: true,
} satisfies Prisma.UserSelect

/**
 * Maps the plugin's failures onto the DAL's errors: a missing user is 404; refusing to act on the
 * admin's own account, or on another admin, is 403. Anything else is a bug and propagates.
 */
const fromAdminApi = (error: unknown): never => {
  if (error instanceof APIError) {
    if (error.body?.code === 'USER_NOT_FOUND') {
      throw new NotFoundError('User not found')
    }
    if (error.status === 'FORBIDDEN' || error.status === 'BAD_REQUEST') {
      throw new ForbiddenError(error.body?.message)
    }
  }
  throw error
}

/** The admin user DTO of one row, fresh from the database (the plugin's own output is untyped). */
const readAdminUser = async (id: string): Promise<AdminUser> => {
  const row = await db.user.findUnique({ where: { id }, select: adminUserSelect })
  if (!row) {
    throw new NotFoundError('User not found')
  }
  return adminUserSchema.parse(row)
}

/**
 * Admin only: every user, newest first, optionally filtered by a search over name, username and
 * email. Never cached: the list carries emails and is restricted to admins, and a shared cache
 * entry would outlive a role change.
 */
export const listUsers = async (query: ListUsersQuery): Promise<Page<AdminUser>> => {
  await requireAdmin()
  const { page, perPage, q } = parseInput(listUsersQuery, query)
  const contains = q ? { contains: escapeLike(q), mode: 'insensitive' as const } : undefined
  const where: Prisma.UserWhereInput = contains
    ? { OR: [{ name: contains }, { username: contains }, { email: contains }] }
    : {}
  const [rows, totalItems] = await Promise.all([
    db.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.user.count({ where }),
  ])
  return toPage(
    rows.map((row) => adminUserSchema.parse(row)),
    totalItems,
    { page, perPage },
  )
}

/**
 * Admin only, in this order: admin (401/403) → input valid (422) → not the admin's own account
 * (403, so the last admin cannot demote themselves) → the user exists (404). Roles are read from
 * the database session on every request, so the change applies on the target's next request.
 */
export const setUserRole = async (input: SetUserRoleInput): Promise<AdminUser> => {
  const viewer = await requireAdmin()
  const { id, role } = parseInput(setUserRoleInput, input)
  if (id === viewer.id) {
    throw new ForbiddenError('You cannot change your own role')
  }
  await auth.api
    .setRole({ body: { userId: id, role }, headers: await headers() })
    .catch(fromAdminApi)
  return readAdminUser(id)
}

/**
 * Admin only: bans a user. Better Auth deletes their sessions and refuses their sign-ins with the
 * reason until `unbanUser`. The plugin refuses to ban the admin's own account (403).
 */
export const banUser = async (input: BanUserInput): Promise<AdminUser> => {
  await requireAdmin()
  const { id, reason } = parseInput(banUserInput, input)
  await auth.api
    .banUser({ body: { userId: id, banReason: reason || undefined }, headers: await headers() })
    .catch(fromAdminApi)
  return readAdminUser(id)
}

export const unbanUser = async (id: string): Promise<AdminUser> => {
  await requireAdmin()
  const userId = parseInput(userIdSchema, id)
  await auth.api.unbanUser({ body: { userId }, headers: await headers() }).catch(fromAdminApi)
  return readAdminUser(userId)
}

/**
 * Admin only: signs this browser in as `id` for an hour, keeping the admin's own session aside so
 * `stopImpersonating` can restore it. The plugin refuses other admins (403). The new session
 * carries `impersonatedBy`, which `getSessionUser` exposes and the layout shows as a banner.
 */
export const impersonateUser = async (id: string): Promise<void> => {
  await requireAdmin()
  const userId = parseInput(userIdSchema, id)
  await auth.api.impersonateUser({ body: { userId }, headers: await headers() }).catch(fromAdminApi)
}

/** Ends an impersonation and restores the admin's session; a plain session answers 403. */
export const stopImpersonating = async (): Promise<void> => {
  await auth.api.stopImpersonating({ headers: await headers() }).catch((error: unknown) => {
    if (error instanceof APIError && error.status === 'BAD_REQUEST') {
      throw new ForbiddenError('You are not impersonating anyone')
    }
    throw error
  })
}
