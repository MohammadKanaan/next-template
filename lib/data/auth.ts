import 'server-only'
import { betterAuth } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { cache } from 'react'
import { loginPath } from '@/lib/constants-routes'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, signUpInput } from '@/lib/dto/auth'
import { MAX_OBJECT_DELETE_DELAY_SECONDS } from '@/lib/dto/uploads'
import type { JobPayload } from '@/jobs/definitions'
import { roleSchema, type Role } from '@/lib/dto/users'
import { deriveUsername } from '@/lib/username'
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

/**
 * Google sign-in is on only when both variables are set. They are read from `process.env` here,
 * like `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, because this config is built when the module is
 * imported and `serverEnv()` is lazy and demands every server variable. `serverEnv()` still lists
 * the pair so one without the other fails at boot in production.
 */
const googleProvider = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return {}
  }
  return {
    google: {
      clientId,
      clientSecret,
      // The `username` column is required and unique, and Google has no such field.
      mapProfileToUser: (profile: { email?: string }) => ({
        username: deriveUsername(profile.email ?? ''),
      }),
    },
  }
}

/** Where `app/api/auth/[...all]` mounts Better Auth (its default `basePath`). */
const AUTH_BASE_PATH = '/api/auth'

/**
 * The payload of a JWT, read without verifying the signature. Only used to decide whether the
 * `/verify-email` hook below applies; Better Auth verifies the token itself right after. Anything
 * unreadable yields `null`.
 */
const decodeJwtPayload = (token: string): unknown => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

const carriesEmailChange = (payload: unknown) =>
  typeof payload === 'object' && payload !== null && 'updateTo' in payload
    ? typeof payload.updateTo === 'string'
    : false

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
    // The plain verification link only verifies the address, it never signs in. The change-email
    // link additionally requires the account's own session (see the `hooks.before` middleware
    // below), because an email verification token is a replayable JWT valid for an hour.
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      queueEmail({ template: 'verify-email', to: user.email, props: { name: user.name, url } })
    },
  },
  // Account linking stays at Better Auth's default: a Google sign-in whose email is verified links
  // to the existing account with that email, but only when that account's own email is verified
  // too (`requireLocalEmailVerified`), so nobody can take over an address they merely registered.
  socialProviders: googleProvider(),
  // Better Auth's HTTP router would bypass our rules: sign-up goes only through `signUpAction`
  // (validated with `signUpInput`), profile edits only through `updateProfile` (same username and
  // name rules), and deleting an account only through `deleteAccountAction`, which always demands
  // the password (over HTTP a fresh session alone could delete); its `/delete-user/callback` goes
  // too, though it is inert while no deletion token is ever issued. Sign-in, password-reset
  // requests and verification-email requests are closed because their actions enforce per-account
  // limits that the router would skip; so are the session-bound account changes (change password,
  // change email, verify password), which go only through their actions and are limited per user
  // there, while Better Auth's own limiter is per process and keyed on a spoofable client address. `auth.api.*` calls made directly from server code are
  // unaffected; only the `/api/auth/*` router honours this list.
  disabledPaths: [
    '/sign-up/email',
    '/update-user',
    '/delete-user',
    '/delete-user/callback',
    '/sign-in/email',
    '/request-password-reset',
    '/send-verification-email',
    '/change-password',
    '/change-email',
    '/verify-password',
  ],
  hooks: {
    // `/verify-email` with a change-email token (`updateTo`) creates a session for whoever opens
    // the link when the browser has none, whatever `autoSignInAfterVerification` says. That would
    // hand an account to a mistyped address or a forwarded link, so such a link without a session is
    // sent to the login page and completes after sign-in. Better Auth itself rejects a session whose
    // email differs from the token's. Runs for the HTTP router and direct `auth.api.*` calls alike.
    before: createAuthMiddleware(async (ctx) => {
      const token: unknown = ctx.query?.token
      if (ctx.path !== '/verify-email' || typeof token !== 'string') {
        return
      }
      if (!carriesEmailChange(decodeJwtPayload(token)) || (await getSessionFromCtx(ctx))) {
        return
      }
      const query = new URLSearchParams({ token })
      if (typeof ctx.query?.callbackURL === 'string') {
        query.set('callbackURL', ctx.query.callbackURL)
      }
      throw ctx.redirect(loginPath(`${AUTH_BASE_PATH}/verify-email?${query}`))
    }),
  },
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
      // keys are read and queued for deletion before the rows disappear. That includes files that
      // other people (an admin) attached to this user's posts: the posts cascade, and those rows
      // would otherwise be left behind. The reverse, files this user (an admin) attached to
      // someone else's post, belong to that post: they are handed to its author first, so the
      // cascade leaves them alone. The jobs are delayed past every ticket's lifetime plus the
      // grace period: an object uploaded through a still-valid ticket after the rows are gone
      // would otherwise be orphaned.
      beforeDelete: async (user) => {
        const onOtherPosts = await db.upload.findMany({
          where: { userId: user.id, post: { userId: { not: user.id } } },
          select: { id: true, post: { select: { userId: true } } },
        })
        for (const { id, post } of onOtherPosts) {
          if (post) {
            await db.upload.update({ where: { id }, data: { userId: post.userId } })
          }
        }
        const uploads = await db.upload.findMany({
          where: { OR: [{ userId: user.id }, { post: { userId: user.id } }] },
          select: { key: true },
        })
        const results = await Promise.allSettled(
          uploads.map(({ key }) =>
            enqueue('delete-object', { key }, { startAfter: MAX_OBJECT_DELETE_DELAY_SECONDS }),
          ),
        )
        for (const result of results) {
          if (result.status === 'rejected') {
            log.error({ err: result.reason, userId: user.id }, 'object not queued for deletion')
          }
        }
        await db.upload.deleteMany({
          where: { post: { userId: user.id }, userId: { not: user.id } },
        })
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

/** Whether the Google button should be offered. Public: it only says what the login page can do. */
export const isGoogleAuthEnabled = (): boolean => {
  return Boolean(auth.options.socialProviders?.google)
}

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
