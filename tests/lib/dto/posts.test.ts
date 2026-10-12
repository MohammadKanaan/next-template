import { describe, expect, it } from 'vitest'
import { MAX_PAGE } from '@/lib/dto/common'
import {
  createPostInput,
  listPostsQuery,
  POST_SEARCH_MAX_LENGTH,
  postDetailBaseSchema,
  postDetailSchema,
  postSummarySchema,
  postsUrlQuery,
  toListPostsParams,
  updatePostInput,
} from '@/lib/dto/posts'

describe('createPostInput', () => {
  it('trims and requires title and body', () => {
    expect(createPostInput.parse({ title: ' Hi ', body: ' There ' })).toEqual({
      title: 'Hi',
      body: 'There',
      published: false,
    })
    const result = createPostInput.safeParse({ title: '  ', body: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Title is required',
      'Body is required',
    ])
  })

  it('bounds the length of title and body', () => {
    expect(createPostInput.safeParse({ title: 'x'.repeat(200), body: 'B' }).success).toBe(true)
    expect(createPostInput.safeParse({ title: 'x'.repeat(201), body: 'B' }).success).toBe(false)
    expect(createPostInput.safeParse({ title: 'T', body: 'x'.repeat(5000) }).success).toBe(true)
    const tooLong = createPostInput.safeParse({ title: 'T', body: 'x'.repeat(5001) })
    expect(tooLong.success).toBe(false)
    expect(tooLong.error?.issues.map((issue) => issue.message)).toEqual([
      'Body must be 5000 characters or fewer',
    ])
  })

  it('creates a draft unless published is passed', () => {
    expect(createPostInput.parse({ title: 'T', body: 'B' }).published).toBe(false)
    expect(createPostInput.parse({ title: 'T', body: 'B', published: true }).published).toBe(true)
    expect(createPostInput.parse({ title: 'T', body: 'B', published: false }).published).toBe(false)
  })

  it('takes published as a boolean only', () => {
    for (const published of ['true', 1, null, 'yes']) {
      expect(
        createPostInput.safeParse({ title: 'T', body: 'B', published }).success,
        String(published),
      ).toBe(false)
    }
  })
})

describe('updatePostInput', () => {
  it('requires at least one attribute', () => {
    const empty = updatePostInput.safeParse({})
    expect(empty.success).toBe(false)
    expect(empty.error?.issues.map((issue) => issue.message)).toEqual([
      'Provide at least one attribute',
    ])
    // An explicit `undefined` (e.g. from a Server Action payload) carries no change either.
    expect(updatePostInput.safeParse({ title: undefined }).success).toBe(false)
    expect(updatePostInput.safeParse({ title: undefined, body: undefined }).success).toBe(false)
  })

  it('accepts any one field, including published alone', () => {
    expect(updatePostInput.parse({ title: ' New ' })).toEqual({ title: 'New' })
    expect(updatePostInput.parse({ body: 'Changed' })).toEqual({ body: 'Changed' })
    // `false` is a value, not an absence.
    expect(updatePostInput.parse({ published: false })).toEqual({ published: false })
    expect(updatePostInput.parse({ published: true })).toEqual({ published: true })
  })

  it('applies the field rules to what is passed', () => {
    expect(updatePostInput.safeParse({ title: '' }).success).toBe(false)
    expect(updatePostInput.safeParse({ title: '   ' }).success).toBe(false)
    expect(updatePostInput.safeParse({ body: 'x'.repeat(5001) }).success).toBe(false)
    expect(updatePostInput.safeParse({ published: 'true' }).success).toBe(false)
  })
})

describe('listPostsQuery', () => {
  it('defaults to the first page, newest first, without filters', () => {
    expect(listPostsQuery.parse({})).toEqual({ page: 1, perPage: 10, sort: 'newest' })
    const query = listPostsQuery.parse({})
    expect(query.q).toBeUndefined()
    expect(query.authorId).toBeUndefined()
    expect(query.published).toBeUndefined()
  })

  it('accepts a UUID as authorId', () => {
    const authorId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    expect(listPostsQuery.parse({ authorId }).authorId).toBe(authorId)
  })

  it('rejects an authorId that is not a UUID', () => {
    for (const authorId of [
      '',
      'a b',
      'x:y',
      'a|b',
      '*',
      'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF',
      'é',
    ]) {
      expect(listPostsQuery.safeParse({ authorId }).success, authorId).toBe(false)
    }
  })

  it('bounds page', () => {
    expect(listPostsQuery.parse({ page: String(MAX_PAGE) }).page).toBe(MAX_PAGE)
    expect(listPostsQuery.safeParse({ page: String(MAX_PAGE + 1) }).success).toBe(false)
    expect(listPostsQuery.safeParse({ page: '0' }).success).toBe(false)
  })

  it('trims q and bounds it', () => {
    expect(listPostsQuery.parse({ q: '  hello ' }).q).toBe('hello')
    expect(listPostsQuery.parse({ q: 'a'.repeat(POST_SEARCH_MAX_LENGTH) }).q).toHaveLength(
      POST_SEARCH_MAX_LENGTH,
    )
    expect(listPostsQuery.safeParse({ q: 'a'.repeat(POST_SEARCH_MAX_LENGTH + 1) }).success).toBe(
      false,
    )
  })

  it('accepts only known sort orders', () => {
    expect(listPostsQuery.parse({ sort: 'oldest' }).sort).toBe('oldest')
    expect(listPostsQuery.parse({ sort: 'newest' }).sort).toBe('newest')
    expect(listPostsQuery.safeParse({ sort: 'relevance' }).success).toBe(false)
    expect(listPostsQuery.safeParse({ sort: 'garbage' }).success).toBe(false)
  })

  it('reads published as a boolean or as the string a query string carries', () => {
    expect(listPostsQuery.parse({ published: true }).published).toBe(true)
    expect(listPostsQuery.parse({ published: false }).published).toBe(false)
    expect(listPostsQuery.parse({ published: 'true' }).published).toBe(true)
    // `z.coerce.boolean()` would read the string 'false' as true.
    expect(listPostsQuery.parse({ published: 'false' }).published).toBe(false)
    expect(listPostsQuery.safeParse({ published: 'maybe' }).success).toBe(false)
    expect(listPostsQuery.safeParse({ published: '' }).success).toBe(false)
  })
})

describe('postsUrlQuery', () => {
  it('parses an empty URL to the defaults', () => {
    expect(postsUrlQuery.parse({})).toEqual({ page: 1, q: '', sort: 'newest' })
  })

  it('falls back per field instead of failing', () => {
    expect(postsUrlQuery.parse({ sort: 'garbage', page: 'abc', q: 'a'.repeat(101) })).toEqual(
      postsUrlQuery.parse({}),
    )
    expect(postsUrlQuery.parse({ page: '0' }).page).toBe(1)
    expect(postsUrlQuery.parse({ page: '-3' }).page).toBe(1)
    expect(postsUrlQuery.parse({ page: String(MAX_PAGE + 1) }).page).toBe(1)
    expect(postsUrlQuery.parse({ page: ['1', '2'], sort: ['oldest'], q: ['a'] })).toEqual({
      page: 1,
      sort: 'newest',
      q: '',
    })
  })

  it('keeps valid values', () => {
    expect(postsUrlQuery.parse({ page: '3', q: ' cats ', sort: 'oldest' })).toEqual({
      page: 3,
      q: 'cats',
      sort: 'oldest',
    })
    expect(postsUrlQuery.parse({ page: String(MAX_PAGE) }).page).toBe(MAX_PAGE)
  })

  it('ignores params it does not know', () => {
    expect(postsUrlQuery.parse({ status: 'draft', tag: 'news' })).toEqual(postsUrlQuery.parse({}))
  })
})

describe('toListPostsParams', () => {
  it('turns an empty search into undefined and keeps page and sort', () => {
    expect(toListPostsParams(postsUrlQuery.parse({}))).toEqual({
      page: 1,
      sort: 'newest',
      q: undefined,
    })
    expect(
      toListPostsParams(postsUrlQuery.parse({ page: '2', q: 'cats', sort: 'oldest' })),
    ).toEqual({ page: 2, sort: 'oldest', q: 'cats' })
  })

  it('produces something listPostsQuery accepts', () => {
    const params = toListPostsParams(postsUrlQuery.parse({ q: 'cats' }))
    expect(listPostsQuery.parse(params)).toEqual({
      page: 1,
      perPage: 10,
      sort: 'newest',
      q: 'cats',
    })
  })
})

describe('output schemas', () => {
  const author = {
    id: '0190d1a2-0000-7000-8000-0000000000a1',
    name: 'Ada',
    username: 'ada',
    website: null,
  }

  it('revives the dates of a summary parsed from JSON', () => {
    const summary = postSummarySchema.parse({
      id: '0190d1a2-0000-7000-8000-000000000001',
      title: 'T',
      excerpt: 'E',
      published: true,
      createdAt: '2026-10-05T15:04:00.000Z',
      author,
    })
    expect(summary.createdAt).toBeInstanceOf(Date)
    expect(summary.createdAt.toISOString()).toBe('2026-10-05T15:04:00.000Z')
  })

  it('requires the permissions on a detail, and leaves them out of the cacheable base', () => {
    const base = {
      id: '0190d1a2-0000-7000-8000-000000000001',
      title: 'T',
      body: 'B',
      published: false,
      createdAt: '2026-10-05T15:04:00.000Z',
      updatedAt: '2026-10-05T15:04:00.000Z',
      author,
    }
    expect(postDetailSchema.safeParse(base).success).toBe(false)
    expect(
      postDetailSchema.safeParse({ ...base, permissions: { update: true, delete: false } }).success,
    ).toBe(true)
    expect(postDetailBaseSchema.parse(base)).not.toHaveProperty('permissions')
    expect(postDetailBaseSchema.parse(base).updatedAt).toBeInstanceOf(Date)
  })
})
