import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, signUpInput } from '@/lib/dto/auth'
import { roleSchema, type Role } from '@/lib/dto/users'
import { invalidateTags } from '@/lib/server/cache'
import { userTag } from './cacheTags'
import { db } from './db'
import { ForbiddenError, UnauthorizedError } from './errors'

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  // Better Auth's HTTP router would bypass our rules: sign-up goes only through `signUpAction`
  // (validated with `signUpInput`), and there is no profile editing yet. `auth.api.*` calls made
  // directly from server code are unaffected; only the `/api/auth/*` router honours this list.
  disabledPaths: ['/sign-up/email', '/update-user'],
  user: {
    additionalFields: {
      username: {
        type: 'string',
        required: true,
        validator: { input: signUpInput.shape.username },
      },
      role: { type: ['user', 'admin'], required: false, defaultValue: 'user', input: false },
    },
  },
  databaseHooks: {
    user: {
      update: {
        // Any Better Auth-side user change (e.g. email verification) must drop the cached viewer.
        after: async (user) => {
          await invalidateTags(userTag(user.id))
        },
      },
    },
  },
  // nextCookies must stay the last plugin: it writes Set-Cookie through next/headers in Server Actions.
  plugins: [nextCookies()],
})

export type SessionUser = { id: string; role: Role }

/** The signed-in user, or null. Deduplicated within one React render (not in Route Handlers). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return null
  }
  return { id: session.user.id, role: roleSchema.parse(session.user.role) }
})

/** Throws `UnauthorizedError` when signed out. Never redirects; pages use `loadPage` for that. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    throw new UnauthorizedError()
  }
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') {
    throw new ForbiddenError()
  }
  return user
}
