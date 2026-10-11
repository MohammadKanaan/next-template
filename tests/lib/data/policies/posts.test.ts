// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/data/auth'
import { postPolicy, type PostRecord } from '@/lib/data/policies/posts'

const author: SessionUser = { id: 'author', role: 'user', sessionId: 's1', impersonatedBy: null }
const stranger: SessionUser = {
  id: 'stranger',
  role: 'user',
  sessionId: 's2',
  impersonatedBy: null,
}
const admin: SessionUser = { id: 'admin', role: 'admin', sessionId: 's3', impersonatedBy: null }
const viewers = { anonymous: null, author, stranger, admin }

const post = (published: boolean): PostRecord => ({ published, authorId: author.id })

describe('postPolicy', () => {
  it('lets anyone view a published post', () => {
    for (const [name, viewer] of Object.entries(viewers)) {
      expect(postPolicy.view(viewer, post(true)), name).toBe(true)
    }
  })

  it('shows a draft to its author and admins only', () => {
    expect(postPolicy.view(null, post(false))).toBe(false)
    expect(postPolicy.view(stranger, post(false))).toBe(false)
    expect(postPolicy.view(author, post(false))).toBe(true)
    expect(postPolicy.view(admin, post(false))).toBe(true)
  })

  it.each(['update', 'delete'] as const)(
    '%s is for the author and admins, draft or published',
    (action) => {
      for (const published of [false, true]) {
        expect(postPolicy[action](null, post(published))).toBe(false)
        expect(postPolicy[action](stranger, post(published))).toBe(false)
        expect(postPolicy[action](author, post(published))).toBe(true)
        expect(postPolicy[action](admin, post(published))).toBe(true)
      }
    },
  )

  it('ignores an impersonated session: the rules look at the acting user only', () => {
    const impersonated: SessionUser = { ...author, impersonatedBy: admin.id }
    expect(postPolicy.update(impersonated, post(false))).toBe(true)
    expect(postPolicy.update(impersonated, { published: true, authorId: stranger.id })).toBe(false)
  })

  it('has exactly the view, update and delete rules', () => {
    expect(Object.keys(postPolicy).sort()).toEqual(['delete', 'update', 'view'])
  })
})
