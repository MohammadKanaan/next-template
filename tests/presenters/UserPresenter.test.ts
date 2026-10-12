import { describe, expect, it } from 'vitest'
import { presentUser } from '@/presenters/UserPresenter'
import type { UserProfile } from '@/lib/dto/users'

const user: UserProfile = {
  id: 'u1',
  name: 'Leanne Graham',
  username: 'leanne',
  website: 'hildegard.org',
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
})
