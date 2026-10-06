import { describe, expect, it } from 'vitest'
import { commentSchema, createCommentInput } from '@/lib/dto/comments'

describe('comment DTOs', () => {
  it('trims and requires the body', () => {
    expect(createCommentInput.parse({ body: '  Hi  ' })).toEqual({ body: 'Hi' })
    const result = createCommentInput.safeParse({ body: '   ' })
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['Comment is required'])
  })

  it('bounds the body', () => {
    expect(createCommentInput.safeParse({ body: 'a'.repeat(1000) }).success).toBe(true)
    expect(createCommentInput.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false)
  })

  it('turns ISO strings from JSON back into Dates', () => {
    const comment = commentSchema.parse({
      id: 1,
      body: 'Hi',
      createdAt: '2026-10-05T10:00:00.000Z',
      author: { id: 'u1', name: 'N', username: 'n', website: null },
      permissions: { delete: false },
    })
    expect(comment.createdAt).toEqual(new Date('2026-10-05T10:00:00.000Z'))
  })
})
