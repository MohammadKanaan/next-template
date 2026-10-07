import { describe, expect, it } from 'vitest'
import { createCommentInput } from '@/lib/dto/comments'

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
})
