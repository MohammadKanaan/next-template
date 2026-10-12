// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { createPost, updatePost } from '@/lib/data/posts'
import { getSitemapPosts } from '@/lib/data/sitemap'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

describe('sitemap DAL', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('is public and lists published posts newest first, with when they changed', async () => {
    const author = await createUser({})
    const older = await db.post.create({
      data: { userId: author.id, title: 'Older', body: 'B', published: true },
    })
    const newer = await db.post.create({
      data: { userId: author.id, title: 'Newer', body: 'B', published: true },
    })
    await db.post.create({ data: { userId: author.id, title: 'Draft', body: 'B' } })

    expect(await getSitemapPosts()).toEqual([
      { id: newer.id, updatedAt: newer.updatedAt },
      { id: older.id, updatedAt: older.updatedAt },
    ])
  })

  it('is cached until a post write invalidates it', async () => {
    const author = await createUser({})
    await signInAs(author)
    const first = await createPost({ title: 'First', body: 'B', published: true })
    expect(await getSitemapPosts()).toHaveLength(1)
    // A write that bypasses the DAL is not seen: the entry is served from Redis.
    await db.post.create({
      data: { userId: author.id, title: 'Quiet', body: 'B', published: true },
    })
    expect(await getSitemapPosts()).toHaveLength(1)

    await updatePost(first.id, { title: 'First, edited' })
    expect(await getSitemapPosts()).toHaveLength(2)
  })
})
