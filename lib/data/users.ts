import 'server-only'
import { cache } from 'react'
import { Prisma } from '@/generated/prisma/client'
import { toPage, type Page } from '@/lib/dto/common'
import {
  currentUserSchema,
  listUsersQuery,
  setUserRoleInput,
  updateProfileInput,
  type AdminUser,
  type CurrentUser,
  type ListUsersQuery,
  type SetUserRoleInput,
  type UpdateProfileInput,
} from '@/lib/dto/users'
import { invalidateTags, remember } from '@/lib/server/cache'
import { recordAudit } from './audit'
import { getSessionUser, requireAdmin, requireUser } from './auth'
import { POSTS_TAG, userTag } from './cacheTags'
import { db } from './db'
import { escapeLike } from './escapeLike'
import {
  ForbiddenError,
  NotFoundError,
  parseInput,
  UnauthorizedError,
  ValidationError,
} from './errors'

/** Selects exactly the `UserProfile` DTO; the row is the DTO, so drift fails to compile. */
export const userProfileSelect = {
  id: true,
  name: true,
  username: true,
  website: true,
} satisfies Prisma.UserSelect

export const currentUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  emailVerified: true,
  image: true,
  website: true,
  role: true,
} satisfies Prisma.UserSelect

const adminUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  emailVerified: true,
  role: true,
  createdAt: true,
  _count: { select: { posts: true } },
} satisfies Prisma.UserSelect

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>

const toAdminUser = ({ _count, ...row }: AdminUserRow): AdminUser => {
  return { ...row, postCount: _count.posts }
}

const VIEWER_CACHE_TTL = 300

/** The signed-in user's record, or null when signed out (e.g. for the nav bar). */
export const getViewer = cache(async (): Promise<CurrentUser | null> => {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return null
  }
  // The session was checked above; the record itself is the same for the user on every request.
  return remember(
    `user:${sessionUser.id}:viewer`,
    {
      ttl: VIEWER_CACHE_TTL,
      tags: [userTag(sessionUser.id)],
      schema: currentUserSchema.nullable(),
    },
    () => db.user.findUnique({ where: { id: sessionUser.id }, select: currentUserSelect }),
  )
})

export const getCurrentUser = async (): Promise<CurrentUser> => {
  const viewer = await getViewer()
  if (!viewer) {
    throw new UnauthorizedError()
  }
  return viewer
}

/**
 * Whether the viewer has a password (a `credential` account). An account created through Google
 * has none until it sets one with the "Forgot password" flow, so password-gated settings (change
 * password, delete account) cannot work for it yet. Not cached: one indexed lookup.
 */
export const hasPassword = async (): Promise<boolean> => {
  const viewer = await requireUser()
  const account = await db.account.findFirst({
    where: { userId: viewer.id, providerId: 'credential' },
    select: { id: true },
  })
  return account !== null
}

export const isUsernameTaken = async (username: string) => {
  return (await db.user.count({ where: { username } })) > 0
}

/**
 * Edits the viewer's own name, username and website. The username is unique, so a collision (also
 * from a race with another request) comes back as a field error. Cached post lists embed the
 * author's name and username, so they are invalidated along with the cached viewer.
 */
export const updateProfile = async (input: UpdateProfileInput): Promise<CurrentUser> => {
  const viewer = await requireUser()
  const data = parseInput(updateProfileInput, input)
  const user = await db.user
    .update({
      where: { id: viewer.id },
      data: {
        name: data.name,
        username: data.username,
        // undefined leaves the website alone; an empty string or null clears it.
        ...(data.website !== undefined && { website: data.website || null }),
      },
      select: currentUserSelect,
    })
    .catch((error: unknown) => {
      // Only `username` is unique among the fields written here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError({ username: ['That username is taken'] })
      }
      throw error
    })
  await invalidateTags(userTag(viewer.id), POSTS_TAG)
  return user
}

/**
 * Admin only: every user with their post count, newest first, optionally filtered by a search over
 * name, username and email. Never cached: the list carries emails and is restricted to admins, and a
 * shared cache entry would outlive a role change.
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
  return toPage(rows.map(toAdminUser), totalItems, { page, perPage })
}

/**
 * Admin only, in this order: admin (401/403) → the user exists (404) → it is not the admin's own
 * account (403, so the last admin cannot demote themselves). Roles are read from the database
 * session on every request, so the change applies on the target's next request.
 */
export const setUserRole = async (input: SetUserRoleInput): Promise<AdminUser> => {
  const viewer = await requireAdmin()
  const { id, role } = parseInput(setUserRoleInput, input)
  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true } })
  if (!target) {
    throw new NotFoundError('User not found')
  }
  if (target.id === viewer.id) {
    throw new ForbiddenError('You cannot change your own role')
  }
  const row = await db.user
    .update({ where: { id }, data: { role }, select: adminUserSelect })
    .catch((error: unknown) => {
      // The user vanished between the check and the write (e.g. they deleted their account).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('User not found')
      }
      throw error
    })
  await invalidateTags(userTag(id))
  await recordAudit({
    actorId: viewer.id,
    action: 'user.role',
    entityId: id,
    metadata: { from: target.role, to: role },
  })
  return toAdminUser(row)
}
