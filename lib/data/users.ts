import 'server-only'
import { cache } from 'react'
import { Prisma } from '@/generated/prisma/client'
import { currentUserSchema, type CurrentUser, type UpdateProfileInput } from '@/lib/dto/users'
import { invalidateTags, remember } from '@/lib/server/cache'
import { getSessionUser, requireUser } from './auth'
import { POSTS_TAG, userTag } from './cacheTags'
import { db } from './db'
import { UnauthorizedError, ValidationError } from './errors'

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

/**
 * Edits the viewer's own name, username and website. The username is unique, so a collision (also
 * from a race with another request) comes back as a field error. Cached post lists embed the
 * author's name and username, so they are invalidated along with the cached viewer.
 */
export async function updateProfile(input: UpdateProfileInput): Promise<CurrentUser> {
  const viewer = await requireUser()
  const user = await db.user
    .update({
      where: { id: viewer.id },
      data: {
        name: input.name,
        username: input.username,
        // undefined leaves the website alone; an empty string or null clears it.
        ...(input.website !== undefined && { website: input.website || null }),
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
