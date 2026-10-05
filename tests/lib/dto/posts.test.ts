import { describe, expect, it } from 'vitest'
import { MAX_PAGE } from '@/lib/dto/common'
import {
  createPostInput,
  listPostsQuery,
  postSummarySchema,
  updatePostInput,
} from '@/lib/dto/posts'

describe('post inputs', () => {
  it('trims and requires title and body', () => {
    expect(createPostInput.parse({ title: ' Hi ', body: ' There ' })).toEqual({
      title: 'Hi',
      body: 'There',
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
    expect(updatePostInput.parse({ title: 'New' })).toEqual({ title: 'New' })
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

describe('postSummarySchema', () => {
  it('turns ISO strings from JSON back into Dates', () => {
    const summary = postSummarySchema.parse({
      id: 1,
      title: 'T',
      excerpt: 'E',
      createdAt: '2026-10-05T10:00:00.000Z',
      author: { id: 'u1', name: 'N', username: 'n', website: null },
    })
    expect(summary.createdAt).toEqual(new Date('2026-10-05T10:00:00.000Z'))
  })
})
