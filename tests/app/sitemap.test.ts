// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sitemap from '@/app/sitemap'
import { db } from '@/lib/data/db'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase } from '../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(async () => import('../helpers/cookies'))
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))

describe('sitemap.xml', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.example')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('lists the landing pages and every published post, never a draft', async () => {
    const author = await createUser({})
    const post = await db.post.create({
      data: { userId: author.id, title: 'Live', body: 'Body', published: true },
    })
    await db.post.create({
      data: { userId: author.id, title: 'Draft', body: 'Body', published: false },
    })

    expect(await sitemap()).toEqual([
      { url: 'https://app.example/' },
      { url: 'https://app.example/posts' },
      { url: `https://app.example/posts/${post.id}`, lastModified: post.updatedAt },
    ])
  })
})
