import { describe, expect, it } from 'vitest'
import { createPostInput, postSummarySchema, updatePostInput } from '@/lib/dto/posts'

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
