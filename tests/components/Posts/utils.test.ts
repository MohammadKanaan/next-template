import { describe, expect, it } from 'vitest'
import { buildPostAttributes, hydratePostForm } from '@/components/Posts/Form/utils'
import type { PostDetail } from '@/lib/dto/posts'

const post: PostDetail = {
  id: '0190d1a2-0000-7000-8000-000000000001',
  title: 'Hello',
  body: 'World',
  published: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: {
    id: '0190d1a2-0000-7000-8000-0000000000a1',
    name: 'Leanne Graham',
    username: 'leanne',
    website: null,
  },
  permissions: { update: true, delete: true },
}

describe('hydratePostForm', () => {
  it('copies the fields of an existing post', () => {
    expect(hydratePostForm(post)).toEqual({ title: 'Hello', body: 'World', published: false })
    expect(hydratePostForm({ ...post, published: true }).published).toBe(true)
  })

  it('starts a new post empty, as a draft', () => {
    expect(hydratePostForm(null)).toEqual({ title: '', body: '', published: false })
  })
})

describe('buildPostAttributes', () => {
  it('sends only the changed fields', () => {
    expect(
      buildPostAttributes({ title: 'Hello', body: 'Changed', published: false }, post),
    ).toEqual({ body: 'Changed' })
    expect(buildPostAttributes({ title: 'New', body: 'Changed', published: false }, post)).toEqual({
      title: 'New',
      body: 'Changed',
    })
  })

  it('sends nothing when nothing changed', () => {
    expect(buildPostAttributes(hydratePostForm(post), post)).toEqual({})
  })

  it('sends published when it flips either way', () => {
    expect(buildPostAttributes({ title: 'Hello', body: 'World', published: true }, post)).toEqual({
      published: true,
    })
    const live = { ...post, published: true }
    expect(buildPostAttributes({ title: 'Hello', body: 'World', published: false }, live)).toEqual({
      published: false,
    })
    expect(buildPostAttributes({ title: 'Hello', body: 'World', published: true }, live)).toEqual(
      {},
    )
  })
})
