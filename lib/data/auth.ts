import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, signUpInput } from '@/lib/dto/auth'
import type { JobPayload } from '@/jobs/definitions'
import { roleSchema, type Role } from '@/lib/dto/users'
import { invalidateTags } from '@/lib/server/cache'
import { logger } from '@/lib/server/logger'
import { enqueue } from '@/lib/server/queue'
import { POSTS_TAG, userTag } from './cacheTags'
import { db } from './db'
import { ForbiddenError, UnauthorizedError } from './errors'

const log = logger.child({ module: 'auth' })

/**
 * Queues an email without awaiting it: the caller's response time must not reveal whether an
 * account exists. A failure to queue is logged; the user can ask again.
 */
const queueEmail = (payload: JobPayload<'send-email'>) => {
  enqueue('send-email', payload).catch((error) => log.error({ err: error }, 'email not queued'))
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Verification is soft: unverified users can sign in; the layout nags them with a banner.
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      queueEmail({ template: 'reset-password', to: user.email, props: { name: user.name, url } })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      queueEmail({ template: 'verify-email', to: user.email, props: { name: user.name, url } })
    },
  },
  // Better Auth's HTTP router would bypass our rules: sign-up goes only through `signUpAction`
  // (validated with `signUpInput`), profile edits only through `updateProfile` (same username and
  // name rules), and deleting an account only through `deleteAccountAction`, which always demands
  // the password (over HTTP a fresh session alone could delete); its `/delete-user/callback` goes
  // too, though it is inert while no deletion token is ever issued. `auth.api.*` calls made
  // directly from server code are unaffected; only the `/api/auth/*` router honours this list.
  disabledPaths: ['/sign-up/email', '/update-user', '/delete-user', '/delete-user/callback'],
  user: {
    changeEmail: {
      enabled: true,
      // A verified user first approves the change from the current address; Better Auth then sends
      // the new address through `sendVerificationEmail` above. A taken address gets the same
      // response, so this cannot be used to find out who has an account.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        queueEmail({
          template: 'confirm-email-change',
          to: user.email,
          props: { name: user.name, newEmail, url },
        })
      },
    },
    deleteUser: {
      enabled: true,
      // Upload rows go with the user (cascade) but their objects would stay in the bucket, so the
      // keys are read and queued for deletion before the rows disappear.
      beforeDelete: async (user) => {
        const uploads = await db.upload.findMany({
          where: { userId: user.id },
          select: { key: true },
        })
        const results = await Promise.allSettled(
          uploads.map(({ key }) => enqueue('delete-object', { key })),
        )
        for (const result of results) {
          if (result.status === 'rejected') {
            log.error({ err: result.reason, userId: user.id }, 'object not queued for deletion')
          }
        }
      },
      // Posts cascade too: drop the cached lists and the cached viewer.
      afterDelete: async (user) => {
        await invalidateTags(POSTS_TAG, userTag(user.id))
      },
    },
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

export type SessionUser = { id: string; role: Role; sessionId: string }

/** The signed-in user, or null. Deduplicated within one React render (not in Route Handlers). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return null
  }
  return {
    id: session.user.id,
    role: roleSchema.parse(session.user.role),
    sessionId: session.session.id,
  }
})

/** Throws `UnauthorizedError` when signed out. Never redirects; pages use `loadPage` for that. */
export const requireUser = async (): Promise<SessionUser> => {
  const user = await getSessionUser()
  if (!user) {
    throw new UnauthorizedError()
  }
  return user
}

export const requireAdmin = async (): Promise<SessionUser> => {
  const user = await requireUser()
  if (user.role !== 'admin') {
    throw new ForbiddenError()
  }
  return user
}
