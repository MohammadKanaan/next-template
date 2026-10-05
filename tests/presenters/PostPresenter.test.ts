import { describe, expect, it } from 'vitest'
import { PostPresenter } from '@/presenters/Post/PostPresenter'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import type { PostDetailedResponse } from '@/services/PostsService'

const post: PostDetailedResponse = {
  id: 9,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  permissions: { update: true, destroy: true },
  title: 'Hello',
  body: 'World',
  user_id: 1,
  user: {
    id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Leanne Graham',
    username: 'leanne',
    phone: null,
    website: null,
  },
}

describe('PostPresenter', () => {
  it('wraps the nested user in its presenter', () => {
    const presenter = new PostPresenter(post)
    expect(presenter.user).toBeInstanceOf(UserPresenter)
    expect(presenter.user?.initials).toBe('LG')
  })

  it('derives a display title', () => {
    expect(new PostPresenter(post).display_title).toBe('Hello')
    expect(new PostPresenter({ ...post, title: '   ' }).display_title).toBe('Untitled')
  })

  it('works without a nested user', () => {
    const { user: _user, ...plain } = post
    expect(new PostPresenter(plain).user).toBeUndefined()
  })
})
