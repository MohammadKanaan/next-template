import 'server-only'
import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { cache } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import { MINUTE } from '@/lib/constants-time'
import { deleteAccountInput, type DeleteAccountInput } from '@/lib/dto/auth'
import {
  currentUserSchema,
  updateProfileInput,
  type CurrentUser,
  type UpdateProfileInput,
} from '@/lib/dto/users'
import { invalidateTags, remember } from '@/lib/server/cache'
import { auth, getSessionUser, requireUser, toRole } from './auth'
import { POSTS_TAG, userTag } from './cacheTags'
import { db } from './db'
import { parseInput, UnauthorizedError, ValidationError } from './errors'
import { isUniqueViolation } from './prismaErrors'
import { consumeRateLimit } from './rateLimit'

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

const VIEWER_CACHE_TTL = 5 * MINUTE
/** Attempts to delete the account one user may make per minute (a wrong password counts). */
const DELETE_ACCOUNT_LIMIT = { max: 3, windowMs: MINUTE * 1000 }

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
    async () => {
      const row = await db.user.findUnique({
        where: { id: sessionUser.id },
        select: currentUserSelect,
      })
      return row ? { ...row, role: toRole(row.role) } : null
    },
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
      if (isUniqueViolation(error, 'users_username_key')) {
        throw new ValidationError({ username: ['That username is taken'] })
      }
      throw error
    })
  await invalidateTags(userTag(viewer.id), POSTS_TAG)
  return { ...user, role: toRole(user.role) }
}

/**
 * Deletes the viewer's account: signed in (401) → within the limit (429) → input valid (422) → the
 * password is right (422 on `password`) → Better Auth deletes the user, and the database cascades
 * their sessions, accounts and posts (`lib/data/auth.ts` queues the avatar's object and drops the
 * cached viewer and post lists in `afterDelete`).
 */
export const deleteAccount = async (input: DeleteAccountInput): Promise<void> => {
  const viewer = await requireUser()
  await consumeRateLimit(`delete-account:user:${viewer.id}`, DELETE_ACCOUNT_LIMIT)
  const { password } = parseInput(deleteAccountInput, input)

  await auth.api
    .deleteUser({ body: { password }, headers: await headers() })
    .catch((error: unknown) => {
      if (error instanceof APIError && error.body?.code === 'INVALID_PASSWORD') {
        throw new ValidationError({ password: ['Password is incorrect'] })
      }
      throw error
    })
}
