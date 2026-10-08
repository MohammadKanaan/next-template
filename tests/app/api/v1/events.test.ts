// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/v1/events/route'
import { userChannel } from '@/lib/data/channels'
import { db } from '@/lib/data/db'
import { createNotification } from '@/lib/data/notifications'
import { publish } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
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

const decoder = new TextDecoder()

const open = () => {
  const controller = new AbortController()
  const request = new Request('http://localhost/api/v1/events', { signal: controller.signal })
  return { controller, response: GET(request) }
}

const readChunk = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const { value, done } = await reader.read()
  return done ? null : decoder.decode(value)
}

describe('GET /api/v1/events', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
    await db.$disconnect()
  })

  it('rejects anonymous callers with 401 JSON', async () => {
    const response = await open().response
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('streams the unread count first, then published events, until the client disconnects', async () => {
    const user = await createUser({})
    await createNotification({ userId: user.id, type: 'comment', title: 'T', body: '', url: '/x' })
    await signInAs(user)

    const { controller, response: pending } = open()
    const response = await pending
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toContain('no-transform')
    const reader = response.body!.getReader()

    expect(await readChunk(reader)).toBe('data: {"type":"unread","count":1}\n\n')
    await publish(userChannel(user.id), { type: 'unread', count: 4 })
    expect(await readChunk(reader)).toBe('data: {"type":"unread","count":4}\n\n')

    controller.abort()
    expect(await readChunk(reader)).toBeNull()
  })
})
