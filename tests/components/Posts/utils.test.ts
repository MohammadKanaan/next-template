import { describe, expect, it } from 'vitest'
import {
  buildPostAttributes,
  hydratePostForm,
  isPostFormField,
} from '@/components/Posts/Form/utils'
import type { PostResponse } from '@/services/PostsService'

const post = {
  id: 1,
  created_at: '',
  updated_at: '',
  permissions: { update: true, destroy: true },
  title: 'Hello',
  body: 'World',
  user_id: 1,
} satisfies PostResponse

describe('post form utils', () => {
  it('hydrates from a post or empty values', () => {
    expect(hydratePostForm(post)).toEqual({ title: 'Hello', body: 'World' })
    expect(hydratePostForm(null)).toEqual({ title: '', body: '' })
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

  it('recognizes form fields', () => {
    expect(isPostFormField('title')).toBe(true)
    expect(isPostFormField('base')).toBe(false)
  })
})
