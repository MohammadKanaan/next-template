// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { NotFoundError, UnauthorizedError } from '@/lib/data/errors'
import { listSessions, revokeOtherSessions, revokeSession } from '@/lib/data/sessions'
import { sessionSummarySchema } from '@/lib/dto/users'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

const hour = 60 * 60 * 1000

async function addSession(
  userId: string,
  overrides: { expiresInMs?: number; agent?: string } = {},
) {
  const id = `session-${Math.random().toString(36).slice(2, 10)}`
  return db.session.create({
    data: {
      id,
      token: `token-${id}`,
      userId,
      userAgent: overrides.agent ?? 'Firefox on Linux',
      ipAddress: '203.0.113.7',
      expiresAt: new Date(Date.now() + (overrides.expiresInMs ?? 24 * hour)),
    },
  })
}

/** createUser's own sign-up session is not under test. */
async function signedInUser() {
  const user = await createUser({})
  await db.session.deleteMany()
  await signInAs(user)
  return user
}

describe('sessions DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('requires a session for every function', async () => {
    signOut()
    await expect(listSessions()).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(revokeSession('x')).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(revokeOtherSessions()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it("lists the viewer's unexpired sessions, marks the current one, and never exposes the token", async () => {
    const other = await createUser({})
    const user = await signedInUser()
    const second = await addSession(user.id)
    await addSession(user.id, { expiresInMs: -hour })
    await addSession(other.id)

    const sessions = await listSessions()
    expect(sessions).toHaveLength(2)
    const current = sessions.find((session) => session.current)
    expect(current).toBeDefined()
    expect(sessions.find((session) => session.id === second.id)).toMatchObject({
      current: false,
      userAgent: 'Firefox on Linux',
      ipAddress: '203.0.113.7',
    })
    for (const session of sessions) {
      expect(Object.keys(session).sort()).toEqual(
        ['createdAt', 'current', 'expiresAt', 'id', 'ipAddress', 'userAgent'].sort(),
      )
      expect(() => sessionSummarySchema.parse(session)).not.toThrow()
    }
  })

  it('revokes one of the viewer’s own sessions', async () => {
    const user = await signedInUser()
    const second = await addSession(user.id)
    await revokeSession(second.id)
    expect(await db.session.findUnique({ where: { id: second.id } })).toBeNull()
    expect(await listSessions()).toHaveLength(1)
  })

  it('treats a session of someone else, or a missing one, as not found and leaves it alone', async () => {
    const other = await createUser({})
    await signedInUser()
    const theirs = await addSession(other.id)
    await expect(revokeSession(theirs.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(revokeSession('missing')).rejects.toBeInstanceOf(NotFoundError)
    expect(await db.session.findUnique({ where: { id: theirs.id } })).not.toBeNull()
  })

  it('ends the session it revokes: that device is signed out on its next request', async () => {
    const user = await signedInUser()
    const current = (await listSessions()).find((session) => session.current)!
    await revokeSession(current.id)
    await expect(listSessions()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(await db.user.count({ where: { id: user.id } })).toBe(1)
  })

  it('revokes every other session of the viewer and nobody else’s', async () => {
    const other = await createUser({})
    const user = await signedInUser()
    await addSession(user.id)
    await addSession(user.id)
    const theirs = await addSession(other.id)

    await revokeOtherSessions()

    const remaining = await listSessions()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].current).toBe(true)
    expect(await db.session.findUnique({ where: { id: theirs.id } })).not.toBeNull()
  })
})
