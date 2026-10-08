// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/data/auth'
import { commentPolicy, postPolicy } from '@/lib/data/policies/posts'
import type { PostStatus } from '@/lib/dto/posts'

const author: SessionUser = { id: 'author', role: 'user', sessionId: 's1' }
const stranger: SessionUser = { id: 'stranger', role: 'user', sessionId: 's2' }
const admin: SessionUser = { id: 'admin', role: 'admin', sessionId: 's3' }
const viewers = { anonymous: null, author, stranger, admin }

const post = (status: PostStatus) => ({ status, authorId: author.id, deletedAt: null })
const trashed = (status: PostStatus) => ({ ...post(status), deletedAt: new Date() })

describe('postPolicy', () => {
  it.each([
    ['published', { anonymous: true, author: true, stranger: true, admin: true }],
    ['draft', { anonymous: false, author: true, stranger: false, admin: true }],
    ['archived', { anonymous: false, author: true, stranger: false, admin: true }],
  ] as const)('view on a %s post', (status, expected) => {
    for (const [name, viewer] of Object.entries(viewers)) {
      expect(postPolicy.view(viewer, post(status)), name).toBe(
        expected[name as keyof typeof expected],
      )
    }
  })

  it.each(['update', 'delete', 'changeStatus'] as const)(
    '%s is for the author and admins, whatever the status',
    (action) => {
      for (const status of ['draft', 'published', 'archived'] as const) {
        expect(postPolicy[action](null, post(status))).toBe(false)
        expect(postPolicy[action](stranger, post(status))).toBe(false)
        expect(postPolicy[action](author, post(status))).toBe(true)
        expect(postPolicy[action](admin, post(status))).toBe(true)
      }
    },
  )

  it('comment is open to anyone who can see a published post, and to nobody otherwise', () => {
    expect(postPolicy.comment(null, post('published'))).toBe(true)
    expect(postPolicy.comment(stranger, post('published'))).toBe(true)
    for (const status of ['draft', 'archived'] as const) {
      expect(postPolicy.comment(author, post(status))).toBe(false)
      expect(postPolicy.comment(admin, post(status))).toBe(false)
      expect(postPolicy.comment(stranger, post(status))).toBe(false)
    }
  })

  it('restore applies only to a trashed post, for its author and admins', () => {
    for (const status of ['draft', 'published', 'archived'] as const) {
      expect(postPolicy.restore(author, post(status))).toBe(false)
      expect(postPolicy.restore(admin, post(status))).toBe(false)
      expect(postPolicy.restore(null, trashed(status))).toBe(false)
      expect(postPolicy.restore(stranger, trashed(status))).toBe(false)
      expect(postPolicy.restore(author, trashed(status))).toBe(true)
      expect(postPolicy.restore(admin, trashed(status))).toBe(true)
    }
  })

  it('a trashed post allows nothing but restore, even to its author and admins', () => {
    for (const action of ['view', 'update', 'delete', 'changeStatus', 'comment'] as const) {
      for (const viewer of Object.values(viewers)) {
        expect(postPolicy[action](viewer, trashed('published')), action).toBe(false)
      }
    }
  })
})

describe('commentPolicy', () => {
  const comment = { authorId: 'commenter', postAuthorId: author.id }
  const commenter: SessionUser = { id: 'commenter', role: 'user', sessionId: 's4' }

  it('delete is for the comment author, the post author and admins', () => {
    expect(commentPolicy.delete(null, comment)).toBe(false)
    expect(commentPolicy.delete(stranger, comment)).toBe(false)
    expect(commentPolicy.delete(commenter, comment)).toBe(true)
    expect(commentPolicy.delete(author, comment)).toBe(true)
    expect(commentPolicy.delete(admin, comment)).toBe(true)
  })
})
