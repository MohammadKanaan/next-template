import 'server-only'
import { cache } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import { currentUserSchema, type CurrentUser } from '@/lib/dto/users'
import { remember } from '@/lib/server/cache'
import { getSessionUser } from './auth'
import { userTag } from './cacheTags'
import { db } from './db'
import { UnauthorizedError } from './errors'

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
  role: true,
} satisfies Prisma.UserSelect

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

export async function getCurrentUser(): Promise<CurrentUser> {
  const viewer = await getViewer()
  if (!viewer) {
    throw new UnauthorizedError()
  }
  return viewer
}

export async function isUsernameTaken(username: string) {
  return (await db.user.count({ where: { username } })) > 0
}
