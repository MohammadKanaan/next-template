import { describe, expect, it } from 'vitest'
import { buildPostAttributes } from '@/components/Posts/Form/utils'
import type { PostDetail } from '@/lib/dto/posts'

const post: PostDetail = {
  id: 1,
  title: 'Hello',
  body: 'World',
  status: 'draft',
  tags: ['news'],
  commentCount: 0,
  publishedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: 'u1', name: 'Leanne Graham', username: 'leanne', website: null },
  permissions: { update: true, delete: true },
}

describe('post form utils', () => {
  it('sends only changed fields when updating', () => {
    expect(buildPostAttributes({ title: 'Hello', body: 'Changed', tags: ['news'] }, post)).toEqual({
      body: 'Changed',
    })
    expect(buildPostAttributes({ title: 'Hello', body: 'World', tags: ['news'] }, post)).toEqual({})
  })

  it('sends the tags when they change, in any order', () => {
    const tagged = { ...post, tags: ['a', 'b'] }
    expect(
      buildPostAttributes({ title: 'Hello', body: 'World', tags: ['b', 'a'] }, tagged),
    ).toEqual({})
    expect(buildPostAttributes({ title: 'Hello', body: 'World', tags: ['a'] }, tagged)).toEqual({
      tags: ['a'],
    })
    expect(buildPostAttributes({ title: 'Hello', body: 'World', tags: [] }, tagged)).toEqual({
      tags: [],
    })
  })
})
