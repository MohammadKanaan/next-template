import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from '@/lib/constants-auth'
import { db } from './db'

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000)
  await db.orm.public.Session.create({
    tokenHash: hashToken(token),
    userId,
    expiresAt: expiresAt.toISOString(),
  })
  const store = await cookies()
  store.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
  return { expiresAt }
}

/** Returns the active session with its user; clears the cookie when it is stale. */
export async function getCurrentSession() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE_NAME)?.value
  if (!token) {
    return null
  }
  const session = await db.orm.public.Session.where({ tokenHash: hashToken(token) })
    .include('user')
    .first()
  const expiresAt = session ? new Date(session.expiresAt) : null
  if (!session || !expiresAt || expiresAt.getTime() <= Date.now()) {
    store.delete(AUTH_COOKIE_NAME)
    return null
  }
  return { ...session, expiresAt }
}

export async function endSession() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE_NAME)?.value
  if (token) {
    await db.orm.public.Session.where({ tokenHash: hashToken(token) }).deleteAll()
  }
  store.delete(AUTH_COOKIE_NAME)
}
