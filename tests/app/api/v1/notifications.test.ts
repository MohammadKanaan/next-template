// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/notifications/route'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/server/push', () => ({ isPushConfigured: () => false }))

const request = (query = '') => new Request(`http://localhost/api/v1/notifications${query}`)

describe('GET /api/v1/notifications', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('needs a session', async () => {
    expect((await GET(request())).status).toBe(401)
  })

  it('returns the viewer’s page and rejects a bad query with 422', async () => {
    const user = await createUser({})
    await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    await signInAs(user)
    const response = await GET(request('?page=1&perPage=5'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ page: 1, perPage: 5, totalItems: 1 })
    expect(body.items[0]).toMatchObject({ title: 'T', readAt: null })
    expect((await GET(request('?page=0'))).status).toBe(422)
  })
})
