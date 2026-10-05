import { describe, expect, it } from 'vitest'
import { UserPresenter } from '@/presenters/User/UserPresenter'
import type { UserResponse } from '@/services/UsersService'

const user: UserResponse = {
  id: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  name: 'Leanne Graham',
  username: 'leanne',
  phone: null,
  website: 'hildegard.org',
}

describe('UserPresenter', () => {
  it('keeps backend fields and derives initials', () => {
    const presenter = new UserPresenter(user)
    expect(presenter.username).toBe('leanne')
    expect(presenter.initials).toBe('LG')
  })

  it('normalizes the website into a URL', () => {
    expect(new UserPresenter(user).website_url).toBe('https://hildegard.org')
    expect(new UserPresenter({ ...user, website: 'http://x.dev' }).website_url).toBe('http://x.dev')
    expect(new UserPresenter({ ...user, website: null }).website_url).toBeNull()
  })

  it('falls back to the username for initials', () => {
    expect(new UserPresenter({ ...user, name: '  ' }).initials).toBe('L')
  })
})
