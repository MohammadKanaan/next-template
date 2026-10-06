import { describe, expect, it } from 'vitest'
import {
  buildPostAttributes,
  hydratePostForm,
  isEmptyPostForm,
} from '@/components/Posts/Form/utils'
import type { PostDetail } from '@/lib/dto/posts'

const post: PostDetail = {
  id: 1,
  title: 'Hello',
  body: 'World',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: 'u1', name: 'Leanne Graham', username: 'leanne', website: null },
  permissions: { update: true, delete: true },
}

describe('post form utils', () => {
  it('hydrates from a post or empty values', () => {
    expect(hydratePostForm(post)).toEqual({ title: 'Hello', body: 'World' })
    expect(hydratePostForm(null)).toEqual({ title: '', body: '' })
  })

  it('hydrates a new post from the draft, but an existing post ignores it', () => {
    const draft = { title: 'Draft', body: 'Text' }
    expect(hydratePostForm(null, draft)).toEqual(draft)
    expect(hydratePostForm(post, draft)).toEqual({ title: 'Hello', body: 'World' })
    expect(hydratePostForm(null, null)).toEqual({ title: '', body: '' })
  })

  it('detects an empty form', () => {
    expect(isEmptyPostForm({ title: '', body: '' })).toBe(true)
    expect(isEmptyPostForm({ title: ' ', body: '' })).toBe(false)
    expect(isEmptyPostForm({ title: '', body: 'x' })).toBe(false)
  })

  it('sends every field when creating', () => {
    expect(buildPostAttributes({ title: 'A', body: 'B' }, null)).toEqual({ title: 'A', body: 'B' })
  })

  it('sends only changed fields when updating', () => {
    expect(buildPostAttributes({ title: 'Hello', body: 'Changed' }, post)).toEqual({
      body: 'Changed',
    })
    expect(buildPostAttributes({ title: 'Hello', body: 'World' }, post)).toEqual({})
  })
})
