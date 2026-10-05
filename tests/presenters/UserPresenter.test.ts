import { describe, expect, it } from 'vitest'
import { presentUser } from '@/presenters/UserPresenter'
import type { UserResponse } from '@/services/UsersService'

const user: UserResponse = {
  id: 1,
  name: 'Leanne Graham',
  username: 'leanne',
  phone: null,
  website: 'hildegard.org',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('presentUser', () => {
  it('turns a bare domain into a linkable URL', () => {
    expect(presentUser(user).website).toBe('https://hildegard.org')
  })

  it('keeps URLs that already have a scheme', () => {
    expect(presentUser({ ...user, website: 'http://x.dev' }).website).toBe('http://x.dev')
    expect(presentUser({ ...user, website: 'HTTPS://x.dev' }).website).toBe('HTTPS://x.dev')
  })

  it('keeps a missing website missing', () => {
    expect(presentUser({ ...user, website: null }).website).toBeNull()
    expect(presentUser({ ...user, website: '' }).website).toBeNull()
  })

  it('passes every other field through untouched', () => {
    const { website: _website, ...rest } = presentUser(user)
    const { website: _original, ...expected } = user
    expect(rest).toEqual(expected)
  })

  it('preserves extra fields such as the current user email', () => {
    expect(presentUser({ ...user, email: 'leanne@example.com' }).email).toBe('leanne@example.com')
  })
})
