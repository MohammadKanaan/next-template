// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DELETE as signOut,
  GET as getSession,
  POST as signIn,
} from '@/app/api/v1/auth/session/route'
import { GET as getMe } from '@/app/api/v1/me/route'
import { AUTH_COOKIE_NAME } from '@/lib/constants-auth'
import { db } from '@/server/db'
import { cookieJar, createUser, jsonRequest, resetDatabase } from './helpers'

const { cookieStore } = await vi.hoisted(async () => import('./helpers'))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))

describe('session API', () => {
  beforeEach(resetDatabase)
  afterAll(() => db.close())

  it('rejects malformed and unknown emails', async () => {
    const malformed = await signIn(
      jsonRequest('/api/v1/auth/session', 'POST', { session: { email: 'nope' } }),
    )
    expect(malformed.status).toBe(422)
    const unknown = await signIn(
      jsonRequest('/api/v1/auth/session', 'POST', { session: { email: 'who@example.com' } }),
    )
    expect(unknown.status).toBe(401)
    expect(cookieJar.has(AUTH_COOKIE_NAME)).toBe(false)
  })

  it('signs in case-insensitively, exposes the profile, and signs out', async () => {
    const user = await createUser({ email: 'leanne@example.com' })
    const created = await signIn(
      jsonRequest('/api/v1/auth/session', 'POST', { session: { email: 'Leanne@Example.com' } }),
    )
    expect(created.status).toBe(201)
    expect(cookieJar.get(AUTH_COOKIE_NAME)).toBeTruthy()
    const stored = await db.orm.public.Session.where({ userId: user.id }).all().firstOrThrow()
    expect(stored.tokenHash).not.toBe(cookieJar.get(AUTH_COOKIE_NAME))

    const me = await getMe(jsonRequest('/api/v1/me', 'GET'))
    expect(await me.json()).toMatchObject({ user: { id: user.id, email: 'leanne@example.com' } })

    const session = await getSession(jsonRequest('/api/v1/auth/session', 'GET'))
    expect(session.status).toBe(200)

    await signOut(jsonRequest('/api/v1/auth/session', 'DELETE'))
    expect(cookieJar.has(AUTH_COOKIE_NAME)).toBe(false)
    const { total } = await db.orm.public.Session.aggregate((a) => ({ total: a.count() }))
    expect(total).toBe(0)
    expect((await getMe(jsonRequest('/api/v1/me', 'GET'))).status).toBe(401)
  })

  it('clears a stale cookie', async () => {
    cookieJar.set(AUTH_COOKIE_NAME, 'stale-token')
    const response = await getMe(jsonRequest('/api/v1/me', 'GET'))
    expect(response.status).toBe(401)
    expect(cookieJar.has(AUTH_COOKIE_NAME)).toBe(false)
  })
})
