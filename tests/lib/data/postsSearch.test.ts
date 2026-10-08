// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import { listPosts, updatePost } from '@/lib/data/posts'
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

type Status = 'draft' | 'published' | 'archived'

const seed = (
  userId: string,
  title: string,
  body = 'Nothing else here',
  extra: { status?: Status; createdAt?: string; deletedAt?: Date; tags?: string[] } = {},
) => {
  return db.post.create({
    data: {
      userId,
      title,
      body,
      status: extra.status ?? 'published',
      ...(extra.createdAt ? { createdAt: new Date(extra.createdAt) } : {}),
      ...(extra.deletedAt ? { deletedAt: extra.deletedAt } : {}),
      ...(extra.tags
        ? {
            tags: {
              create: extra.tags.map((name) => ({
                tag: { connectOrCreate: { where: { name }, create: { name } } },
              })),
            },
          }
        : {}),
    },
  })
}

const search = async (q: string, params: Partial<Parameters<typeof listPosts>[0]> = {}) => {
  return listPosts({ page: 1, perPage: 50, q, ...params })
}

const titlesOf = async (q: string, params: Partial<Parameters<typeof listPosts>[0]> = {}) => {
  return (await search(q, params)).items.map((post) => post.title)
}

describe('post full-text search', () => {
  beforeEach(resetDatabase)
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  it('finds a word that only the body has', async () => {
    const author = await createUser({})
    await seed(author.id, 'Gardening', 'Remember to water the hydrangea')
    await seed(author.id, 'Cooking', 'Salt the pasta water')
    expect(await titlesOf('hydrangea')).toEqual(['Gardening'])
  })

  it('stems words: running finds run and the other way round', async () => {
    const author = await createUser({})
    await seed(author.id, 'Morning routine', 'I run every day')
    await seed(author.id, 'Running tips', 'Shoes matter')
    await seed(author.id, 'Swimming', 'Laps')
    expect(await titlesOf('running')).toEqual(['Running tips', 'Morning routine'])
    expect(await titlesOf('run')).toEqual(['Running tips', 'Morning routine'])
  })

  it('matches a quoted phrase in order, and supports exclusion', async () => {
    const author = await createUser({})
    await seed(author.id, 'The quick brown fox')
    await seed(author.id, 'A brown dog that is quick')
    expect((await titlesOf('quick brown')).sort()).toEqual([
      'A brown dog that is quick',
      'The quick brown fox',
    ])
    expect(await titlesOf('"quick brown"')).toEqual(['The quick brown fox'])
    expect(await titlesOf('brown -fox')).toEqual(['A brown dog that is quick'])
  })

  it('ranks a title match above a body match, unless a sort says otherwise', async () => {
    const author = await createUser({})
    await seed(author.id, 'Kubernetes basics')
    await seed(author.id, 'Deployments', 'We use kubernetes in production')
    expect(await titlesOf('kubernetes')).toEqual(['Kubernetes basics', 'Deployments'])
    expect(await titlesOf('kubernetes', { sort: 'relevance' })).toEqual([
      'Kubernetes basics',
      'Deployments',
    ])
    expect(await titlesOf('kubernetes', { sort: 'newest' })).toEqual([
      'Deployments',
      'Kubernetes basics',
    ])
    expect(await titlesOf('kubernetes', { sort: 'oldest' })).toEqual([
      'Kubernetes basics',
      'Deployments',
    ])
  })

  it('treats relevance without a search as newest first', async () => {
    const author = await createUser({})
    await seed(author.id, 'First')
    await seed(author.id, 'Second')
    const page = await listPosts({ page: 1, perPage: 10, sort: 'relevance' })
    expect(page.items.map((post) => post.title)).toEqual(['Second', 'First'])
  })

  it('does not find a stranger a draft, an archived post or a trashed post', async () => {
    const author = await createUser({})
    const stranger = await createUser({})
    await seed(author.id, 'Secret draft', 'x', { status: 'draft' })
    await seed(author.id, 'Secret archive', 'x', { status: 'archived' })
    await seed(author.id, 'Secret trash', 'x', { deletedAt: new Date() })
    await seed(author.id, 'Secret public')
    for (const viewer of [null, stranger]) {
      if (viewer) {
        await signInAs(viewer)
      } else {
        signOut()
      }
      expect(await titlesOf('secret')).toEqual(['Secret public'])
      // Asking for another status, or the trash, does not widen it either.
      expect(await titlesOf('secret', { status: 'draft' })).toEqual(['Secret public'])
      expect(await titlesOf('secret', { trash: true })).toEqual(['Secret public'])
      expect(await titlesOf('secret', { authorId: author.id, status: 'draft' })).toEqual([
        'Secret public',
      ])
    }
  })

  it('shows an author their own drafts, and an admin any status they ask for', async () => {
    const author = await createUser({})
    const admin = await createUser({ role: 'admin' })
    await seed(author.id, 'Secret draft', 'x', { status: 'draft' })
    await seed(author.id, 'Secret public')
    await signInAs(author)
    expect((await titlesOf('secret', { authorId: author.id })).sort()).toEqual([
      'Secret draft',
      'Secret public',
    ])
    await signInAs(admin)
    expect(await titlesOf('secret')).toEqual(['Secret public'])
    expect(await titlesOf('secret', { status: 'draft' })).toEqual(['Secret draft'])
  })

  it('composes with the author, tag, status and date filters, and counts only the matches', async () => {
    const a = await createUser({})
    const b = await createUser({})
    const hit1 = await seed(a.id, 'Cats one', 'x', {
      createdAt: '2026-10-02T00:00:00Z',
      tags: ['pets'],
    })
    const hit2 = await seed(a.id, 'Cats two', 'x', {
      createdAt: '2026-10-03T12:00:00Z',
      tags: ['pets'],
    })
    await seed(a.id, 'Cats three', 'x', { createdAt: '2026-10-03T00:00:00Z', tags: ['other'] })
    await seed(b.id, 'Cats four', 'x', { createdAt: '2026-10-03T00:00:00Z', tags: ['pets'] })
    await seed(a.id, 'Cats five', 'x', { createdAt: '2026-11-03T00:00:00Z', tags: ['pets'] })
    await seed(a.id, 'Dogs', 'x', { createdAt: '2026-10-03T00:00:00Z', tags: ['pets'] })
    const params = { authorId: a.id, tag: 'pets', from: '2026-10-01', to: '2026-10-31' }
    const page = await search('cats', { ...params, sort: 'oldest', perPage: 1 })
    expect(page.items.map((post) => post.id)).toEqual([hit1.id])
    expect(page.totalItems).toBe(2)
    expect(page.totalPages).toBe(2)
    const second = await search('cats', { ...params, sort: 'oldest', perPage: 1, page: 2 })
    expect(second.items.map((post) => post.id)).toEqual([hit2.id])
    // `to` is inclusive of the whole day.
    expect(await titlesOf('cats', { authorId: a.id, to: '2026-10-03', sort: 'oldest' })).toEqual([
      'Cats one',
      'Cats two',
      'Cats three',
    ])
  })

  it('pages through the matches and keeps the total beyond the last page', async () => {
    const author = await createUser({})
    for (const n of [1, 2, 3, 4, 5]) {
      await seed(author.id, `Match ${n}`)
    }
    const last = await search('match', { perPage: 2, page: 3, sort: 'oldest' })
    expect(last.items.map((post) => post.title)).toEqual(['Match 5'])
    expect(last).toMatchObject({ totalItems: 5, totalPages: 3 })
    const beyond = await search('match', { perPage: 2, page: 4 })
    expect(beyond).toMatchObject({ items: [], totalItems: 5, totalPages: 3 })
  })

  it('returns an empty page for a search of stop words only, or of nothing searchable', async () => {
    const author = await createUser({})
    await seed(author.id, 'The best of the best', 'It is what it is')
    for (const q of ['the', 'the and of', 'is it', '!!!', '"', '-']) {
      expect(await search(q), q).toMatchObject({ items: [], totalItems: 0, totalPages: 1 })
    }
  })

  it('returns summaries like the plain list: excerpt, author, tags and comment count', async () => {
    const author = await createUser({ name: 'Ada' })
    const post = await seed(author.id, 'Searchable post', 'y'.repeat(200), { tags: ['b', 'a'] })
    await db.comment.create({ data: { postId: post.id, userId: author.id, body: 'hi' } })
    const [item] = (await search('searchable')).items
    expect(item).toMatchObject({
      id: post.id,
      title: 'Searchable post',
      excerpt: `${'y'.repeat(160)}…`,
      status: 'published',
      tags: ['a', 'b'],
      commentCount: 1,
      author: { id: author.id, name: 'Ada' },
    })
    expect(item.createdAt).toBeInstanceOf(Date)
  })

  it('follows an edit at once: the stored vector is maintained by the database', async () => {
    const author = await createUser({})
    const post = await seed(author.id, 'Old title', 'old words')
    await signInAs(author)
    expect(await titlesOf('words')).toEqual(['Old title'])
    await updatePost(post.id, { version: 1, title: 'Fresh title', body: 'brand new text' })
    expect(await titlesOf('words')).toEqual([])
    expect(await titlesOf('fresh')).toEqual(['Fresh title'])
    expect(await titlesOf('brand')).toEqual(['Fresh title'])
  })

  it('leaves out a post that was trashed between the search and the read of its summary', async () => {
    const author = await createUser({})
    await seed(author.id, 'Zebra stays')
    const leaving = await seed(author.id, 'Zebra leaves')
    const realQuery = db.$queryRaw.bind(db)
    vi.spyOn(db, '$queryRaw').mockImplementationOnce(((...args: Parameters<typeof realQuery>) => {
      // The ids are read; then the post goes to the trash before the summaries are.
      return realQuery(...args).then(async (rows) => {
        await db.post.update({ where: { id: leaving.id }, data: { deletedAt: new Date() } })
        return rows
      })
    }) as never)
    expect(await titlesOf('zebra')).toEqual(['Zebra stays'])
  })

  it('treats SQL and operator characters in a search as plain text', async () => {
    const author = await createUser({})
    await seed(author.id, 'Normal post')
    for (const q of ["'; DROP TABLE posts; --", '&|!():*<>', 'a" or "b']) {
      expect(await search(q), q).toMatchObject({ items: [], totalItems: 0 })
    }
    expect(await db.post.count()).toBe(1)
  })

  describe('parity with the plain list', () => {
    // Every post says "zebra", so a search for it must return exactly what the same filters return
    // without a search: the Prisma `where` and the SQL conditions are built from one description.
    const queries: Partial<Parameters<typeof listPosts>[0]>[] = [
      {},
      { status: 'draft' },
      { status: 'archived' },
      { status: 'published' },
      { trash: true },
      { trash: true, status: 'draft' },
      { tag: 'news' },
      { tag: 'unknown' },
      { from: '2026-10-03' },
      { to: '2026-10-03' },
      { from: '2026-10-02', to: '2026-10-04' },
      { sort: 'oldest' },
    ]

    it('applies the same visibility and filters on both paths, for every viewer', async () => {
      const a = await createUser({})
      const b = await createUser({})
      const admin = await createUser({ role: 'admin' })
      let n = 0
      for (const author of [a, b]) {
        for (const status of ['draft', 'published', 'archived'] as const) {
          for (const trashed of [false, true]) {
            for (const tags of [['news'], ['other'], []]) {
              n += 1
              await seed(author.id, `Zebra ${n}`, 'zebra', {
                status,
                tags,
                deletedAt: trashed ? new Date() : undefined,
                createdAt: `2026-10-0${(n % 5) + 1}T0${n % 10}:00:00Z`,
              })
            }
          }
        }
      }
      // Posts exactly on a day boundary, where an inclusive/exclusive slip would show.
      await seed(a.id, 'Zebra start', 'zebra', { createdAt: '2026-10-03T00:00:00.000Z' })
      await seed(a.id, 'Zebra next day', 'zebra', { createdAt: '2026-10-04T00:00:00.000Z' })
      const own = (viewer: { id: string }) => [{}, { authorId: viewer.id }]
      const cases: [string, { id: string; email: string } | null, object[]][] = [
        ['anonymous', null, [{}, { authorId: a.id }]],
        ['author', a, own(a)],
        ['stranger', b, [{}, { authorId: a.id }]],
        ['admin', admin, [{}, { authorId: a.id }]],
      ]
      let compared = 0
      for (const [label, viewer, scopes] of cases) {
        if (viewer) {
          await signInAs(viewer)
        } else {
          signOut()
        }
        for (const scope of scopes) {
          for (const query of queries) {
            const params = { page: 1, perPage: 100, ...scope, ...query }
            const plain = await listPosts(params)
            const found = await listPosts({ ...params, q: 'zebra' })
            const name = `${label} ${JSON.stringify({ ...scope, ...query })}`
            expect(found.items.map((post) => post.id).sort(), name).toEqual(
              plain.items.map((post) => post.id).sort(),
            )
            expect(found.totalItems, name).toBe(plain.totalItems)
            compared += plain.totalItems
          }
        }
      }
      // The comparison is not vacuous: the cases above do return posts.
      expect(compared).toBeGreaterThan(100)
    })
  })
})
