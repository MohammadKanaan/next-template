import { describe, expect, it } from 'vitest'
import { MAX_PAGE } from '@/lib/dto/common'
import {
  canTransitionPostStatus,
  createPostInput,
  listPostsQuery,
  resolvePostsSort,
  setPostStatusInput,
  tagNameSchema,
  postsUrlQuery,
  hasActivePostFilters,
  toListPostsParams,
  updatePostInput,
} from '@/lib/dto/posts'

describe('post inputs', () => {
  it('trims and requires title and body', () => {
    expect(createPostInput.parse({ title: ' Hi ', body: ' There ' })).toEqual({
      title: 'Hi',
      body: 'There',
      tags: [],
    })
    const result = createPostInput.safeParse({ title: '  ', body: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Title is required',
      'Body is required',
    ])
  })

  it('requires at least one attribute to update', () => {
    expect(updatePostInput.safeParse({}).success).toBe(false)
    expect(updatePostInput.safeParse({ version: 1 }).success).toBe(false)
    expect(updatePostInput.parse({ title: 'New', version: 1 })).toEqual({
      title: 'New',
      version: 1,
    })
  })

  it('requires the version of the post being edited, as a positive integer', () => {
    expect(updatePostInput.safeParse({ title: 'New' }).success).toBe(false)
    for (const version of [0, -1, 1.5, '1', null]) {
      expect(updatePostInput.safeParse({ title: 'New', version }).success, String(version)).toBe(
        false,
      )
    }
  })
})

describe('tags', () => {
  it('normalizes a tag name: trimmed and lowercased', () => {
    expect(tagNameSchema.parse('  TypeScript ')).toBe('typescript')
  })

  it('rejects empty and overlong tag names', () => {
    expect(tagNameSchema.safeParse('   ').success).toBe(false)
    expect(tagNameSchema.safeParse('a'.repeat(30)).success).toBe(true)
    expect(tagNameSchema.safeParse('a'.repeat(31)).success).toBe(false)
  })

  it('lowercases and de-duplicates the tags of a post, and allows at most five', () => {
    expect(createPostInput.parse({ title: 'T', body: 'B', tags: ['A', ' a ', 'b'] }).tags).toEqual([
      'a',
      'b',
    ])
    expect(
      createPostInput.safeParse({ title: 'T', body: 'B', tags: ['a', 'b', 'c', 'd', 'e', 'f'] })
        .success,
    ).toBe(false)
  })

  it('leaves the tags out of an update that does not mention them', () => {
    expect(updatePostInput.parse({ title: 'New', version: 1 })).not.toHaveProperty('tags')
    expect(updatePostInput.parse({ tags: [], version: 1 })).toEqual({ tags: [], version: 1 })
  })
})

describe('status workflow', () => {
  it('answers canTransitionPostStatus from the map', () => {
    expect(canTransitionPostStatus('draft', 'published')).toBe(true)
    expect(canTransitionPostStatus('draft', 'archived')).toBe(false)
    expect(canTransitionPostStatus('published', 'published')).toBe(false)
  })

  it('validates the input of a status change', () => {
    expect(setPostStatusInput.parse({ id: '3', status: 'archived' })).toEqual({
      id: 3,
      status: 'archived',
    })
    expect(setPostStatusInput.safeParse({ id: 3, status: 'deleted' }).success).toBe(false)
  })
})

describe('listPostsQuery', () => {
  it('accepts Better Auth style ids and UUIDs as authorId', () => {
    for (const authorId of [
      'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ]) {
      expect(listPostsQuery.parse({ authorId }).authorId).toBe(authorId)
    }
  })

  it('rejects an authorId that is not an id', () => {
    for (const authorId of ['', 'a b', 'x:y', 'a|b', '*', 'a'.repeat(65), 'é']) {
      expect(listPostsQuery.safeParse({ authorId }).success).toBe(false)
    }
  })

  it('bounds page', () => {
    expect(listPostsQuery.parse({ page: String(MAX_PAGE) }).page).toBe(MAX_PAGE)
    expect(listPostsQuery.safeParse({ page: String(MAX_PAGE + 1) }).success).toBe(false)
  })
})

describe('listPostsQuery search and sort', () => {
  it('leaves sort and q unset, so the DAL can default the order from the search', () => {
    const query = listPostsQuery.parse({})
    expect(query.sort).toBeUndefined()
    expect(query.q).toBeUndefined()
  })

  it('resolves the order: relevance only while searching, an explicit order wins', () => {
    expect(resolvePostsSort(undefined, false)).toBe('newest')
    expect(resolvePostsSort('', false)).toBe('newest')
    expect(resolvePostsSort(undefined, true)).toBe('relevance')
    expect(resolvePostsSort('', true)).toBe('relevance')
    expect(resolvePostsSort('relevance', false)).toBe('newest')
    expect(resolvePostsSort('relevance', true)).toBe('relevance')
    expect(resolvePostsSort('oldest', true)).toBe('oldest')
    expect(resolvePostsSort('newest', true)).toBe('newest')
  })

  it('trims q and bounds it', () => {
    expect(listPostsQuery.parse({ q: '  hello ' }).q).toBe('hello')
    expect(listPostsQuery.parse({ q: 'a'.repeat(100) }).q).toHaveLength(100)
    expect(listPostsQuery.safeParse({ q: 'a'.repeat(101) }).success).toBe(false)
  })

  it('accepts only known sort orders', () => {
    expect(listPostsQuery.parse({ sort: 'oldest' }).sort).toBe('oldest')
    expect(listPostsQuery.parse({ sort: 'relevance' }).sort).toBe('relevance')
    expect(listPostsQuery.safeParse({ sort: 'garbage' }).success).toBe(false)
  })
})

describe('postsUrlQuery', () => {
  it('parses an empty URL to the defaults', () => {
    expect(postsUrlQuery.parse({})).toEqual({
      page: 1,
      q: '',
      sort: '',
      status: '',
      tag: '',
      from: '',
      to: '',
      trash: false,
    })
  })

  it('falls back per field instead of failing', () => {
    expect(postsUrlQuery.parse({ sort: 'garbage', page: 'abc', q: 'a'.repeat(101) })).toEqual(
      postsUrlQuery.parse({}),
    )
    expect(
      postsUrlQuery.parse({
        status: 'deleted',
        tag: 'x'.repeat(31),
        from: '2026-13-45',
        to: 'yesterday',
        trash: 'maybe',
      }),
    ).toEqual(postsUrlQuery.parse({}))
    expect(postsUrlQuery.parse({ page: '0' }).page).toBe(1)
    expect(postsUrlQuery.parse({ page: String(MAX_PAGE + 1) }).page).toBe(1)
    expect(postsUrlQuery.parse({ page: ['1', '2'], sort: ['oldest'] })).toMatchObject({
      page: 1,
      sort: '',
    })
  })

  it('reads trash as a flag: only a true value turns it on', () => {
    expect(postsUrlQuery.parse({ trash: 'true' }).trash).toBe(true)
    expect(postsUrlQuery.parse({ trash: 'false' }).trash).toBe(false)
    expect(postsUrlQuery.parse({ trash: '' }).trash).toBe(false)
  })

  it('keeps valid values', () => {
    expect(postsUrlQuery.parse({ page: '3', q: ' cats ', sort: 'oldest' })).toEqual({
      ...postsUrlQuery.parse({}),
      page: 3,
      q: 'cats',
      sort: 'oldest',
    })
  })

  it('parses the filters: status, a normalized tag and ISO days', () => {
    expect(
      postsUrlQuery.parse({ status: 'draft', tag: ' News ', from: '2026-10-01', to: '2026-10-31' }),
    ).toMatchObject({ status: 'draft', tag: 'news', from: '2026-10-01', to: '2026-10-31' })
    expect(postsUrlQuery.parse({ status: '' }).status).toBe('')
  })
})

describe('listPostsQuery trash', () => {
  it('defaults to false and reads true / false as a boolean or a string', () => {
    expect(listPostsQuery.parse({}).trash).toBe(false)
    expect(listPostsQuery.parse({ trash: true }).trash).toBe(true)
    expect(listPostsQuery.parse({ trash: 'true' }).trash).toBe(true)
    // `z.coerce.boolean()` would read the string 'false' as true.
    expect(listPostsQuery.parse({ trash: 'false' }).trash).toBe(false)
    expect(listPostsQuery.safeParse({ trash: 'maybe' }).success).toBe(false)
  })
})

describe('listPostsQuery filters', () => {
  it('leaves status, tag and dates out by default', () => {
    const query = listPostsQuery.parse({})
    expect([query.status, query.tag, query.from, query.to]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('accepts a status, a tag and ISO days, normalizing the tag', () => {
    expect(
      listPostsQuery.parse({
        status: 'archived',
        tag: ' News ',
        from: '2026-02-28',
        to: '2026-03-01',
      }),
    ).toMatchObject({ status: 'archived', tag: 'news', from: '2026-02-28', to: '2026-03-01' })
  })

  it('rejects what the URL contract would fall back from', () => {
    for (const bad of [
      { status: 'deleted' },
      { tag: '' },
      { tag: 'x'.repeat(31) },
      { from: '2026-02-30' },
      { to: '10/05/2026' },
      { from: '2026-10-05T10:00:00Z' },
    ]) {
      expect(listPostsQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('toListPostsParams', () => {
  it('turns empty filters into undefined and keeps the rest', () => {
    expect(toListPostsParams(postsUrlQuery.parse({}))).toEqual({
      page: 1,
      sort: undefined,
      q: undefined,
      status: undefined,
      tag: undefined,
      from: undefined,
      to: undefined,
      trash: false,
    })
    expect(
      toListPostsParams(postsUrlQuery.parse({ page: '2', tag: 'news', status: 'draft' })),
    ).toMatchObject({ page: 2, tag: 'news', status: 'draft' })
  })
})

describe('hasActivePostFilters', () => {
  it('ignores page and sort', () => {
    expect(hasActivePostFilters(postsUrlQuery.parse({ page: '3', sort: 'oldest' }))).toBe(false)
    for (const key of ['q', 'tag', 'from', 'to', 'status', 'trash']) {
      const value =
        key === 'from' || key === 'to'
          ? '2026-10-01'
          : key === 'status'
            ? 'draft'
            : key === 'trash'
              ? 'true'
              : 'x'
      expect(hasActivePostFilters(postsUrlQuery.parse({ [key]: value })), key).toBe(true)
    }
  })
})
