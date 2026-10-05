import 'server-only'
import { cache } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import type { CurrentUser } from '@/lib/dto/users'
import { getSessionUser } from './auth'
import { db } from './db'
import { UnauthorizedError } from './errors'

/** Selects exactly the `UserProfile` DTO; the row is the DTO, so drift fails to compile. */
export const userProfileSelect = {
  id: true,
  name: true,
  username: true,
  website: true,
} satisfies Prisma.UserSelect

const currentUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect

/** The signed-in user's record, or null when signed out (e.g. for the nav bar). */
export const getViewer = cache(async (): Promise<CurrentUser | null> => {
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return null
  }
  return db.user.findUnique({ where: { id: sessionUser.id }, select: currentUserSelect })
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
