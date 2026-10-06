import { describe, expect, it } from 'vitest'
import { MAX_PAGE } from '@/lib/dto/common'
import {
  adminUserSchema,
  listUsersQuery,
  sessionIdSchema,
  sessionSummarySchema,
  setUserRoleInput,
  updateProfileInput,
  USER_SEARCH_MAX_LENGTH,
  usersUrlQuery,
  WEBSITE_MAX_LENGTH,
} from '@/lib/dto/users'

const valid = { name: 'Ada Lovelace', username: 'ada_l' }

describe('updateProfileInput', () => {
  it('trims the name and follows the sign-up username rules', () => {
    expect(updateProfileInput.parse({ ...valid, name: '  Ada  ' }).name).toBe('Ada')
    const result = updateProfileInput.safeParse({ name: '', username: 'A!' })
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'name',
      'username',
      'username',
    ])
  })

  it('leaves the website optional: undefined, null and empty are all valid', () => {
    expect(updateProfileInput.parse(valid).website).toBeUndefined()
    expect(updateProfileInput.parse({ ...valid, website: null }).website).toBeNull()
    expect(updateProfileInput.parse({ ...valid, website: '  ' }).website).toBe('')
  })

  it('accepts a bare domain or an http(s) address', () => {
    for (const website of ['example.com', 'www.example.co.uk/path?q=1', 'https://example.com']) {
      expect(updateProfileInput.parse({ ...valid, website }).website).toBe(website)
    }
  })

  it('rejects other schemes, whitespace and nonsense, and caps the length', () => {
    for (const website of [
      'javascript:alert(1)',
      'ftp://example.com',
      'not a url',
      'localhost',
      `https://${'a'.repeat(WEBSITE_MAX_LENGTH)}.com`,
    ]) {
      expect(updateProfileInput.safeParse({ ...valid, website }).success).toBe(false)
    }
  })
})

describe('sessions', () => {
  it('bounds the session id', () => {
    expect(sessionIdSchema.safeParse('abc').success).toBe(true)
    expect(sessionIdSchema.safeParse('').success).toBe(false)
    expect(sessionIdSchema.safeParse('a'.repeat(65)).success).toBe(false)
  })

  it('turns ISO strings back into Dates and has no token field', () => {
    const summary = sessionSummarySchema.parse({
      id: 's1',
      current: true,
      userAgent: null,
      ipAddress: null,
      createdAt: '2026-10-05T10:00:00.000Z',
      expiresAt: '2026-10-12T10:00:00.000Z',
      token: 'secret',
    })
    expect(summary.createdAt).toEqual(new Date('2026-10-05T10:00:00.000Z'))
    expect(summary).not.toHaveProperty('token')
  })
})

describe('admin user list', () => {
  it('turns ISO strings back into Dates', () => {
    const user = adminUserSchema.parse({
      id: 'u1',
      name: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      emailVerified: true,
      role: 'admin',
      createdAt: '2026-10-05T10:00:00.000Z',
      postCount: 3,
    })
    expect(user.createdAt).toEqual(new Date('2026-10-05T10:00:00.000Z'))
  })

  it('bounds and trims the search, and defaults the paging', () => {
    expect(listUsersQuery.parse({})).toMatchObject({ page: 1 })
    expect(listUsersQuery.parse({ q: '  ada ' }).q).toBe('ada')
    expect(listUsersQuery.safeParse({ q: 'a'.repeat(USER_SEARCH_MAX_LENGTH + 1) }).success).toBe(
      false,
    )
    expect(listUsersQuery.safeParse({ page: String(MAX_PAGE + 1) }).success).toBe(false)
  })

  it('parses any URL by falling back per field', () => {
    expect(usersUrlQuery.parse({})).toEqual({ page: 1, q: '' })
    expect(usersUrlQuery.parse({ page: 'abc', q: 'a'.repeat(101) })).toEqual({ page: 1, q: '' })
    expect(usersUrlQuery.parse({ page: '2', q: ' ada ' })).toEqual({ page: 2, q: 'ada' })
  })

  it('accepts a user id and a known role only', () => {
    expect(setUserRoleInput.parse({ id: 'abc-123', role: 'admin' })).toEqual({
      id: 'abc-123',
      role: 'admin',
    })
    expect(setUserRoleInput.safeParse({ id: 'abc-123', role: 'owner' }).success).toBe(false)
    expect(setUserRoleInput.safeParse({ id: 'a b', role: 'user' }).success).toBe(false)
    expect(setUserRoleInput.safeParse({ id: '', role: 'user' }).success).toBe(false)
  })
})
