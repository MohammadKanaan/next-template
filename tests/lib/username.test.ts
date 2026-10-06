import { describe, expect, it } from 'vitest'
import { signUpInput } from '@/lib/dto/auth'
import { deriveUsername } from '@/lib/username'

const isValid = (username: string) => signUpInput.shape.username.safeParse(username).success

describe('deriveUsername', () => {
  it('uses the local part of the email and appends the suffix', () => {
    expect(deriveUsername('ada@example.com', 'abc123')).toBe('ada_abc123')
  })

  it('lowercases and reduces the local part to letters, digits and underscores', () => {
    expect(deriveUsername('Ada.Lovelace+news@example.com', 'abc123')).toBe(
      'ada_lovelace_news_abc123',
    )
    expect(deriveUsername('josé-ñandú@example.com', 'abc123')).toBe('jose_nandu_abc123')
    expect(deriveUsername('__a--b__@example.com', 'abc123')).toBe('a_b_abc123')
  })

  it('falls back to a plain base when nothing usable is left', () => {
    expect(deriveUsername('@example.com', 'abc123')).toBe('user_abc123')
    expect(deriveUsername('...@example.com', 'abc123')).toBe('user_abc123')
    expect(deriveUsername('日本語@example.com', 'abc123')).toBe('user_abc123')
    expect(deriveUsername('', 'abc123')).toBe('user_abc123')
  })

  it('trims a long local part so the whole username stays within 30 characters', () => {
    const username = deriveUsername(`${'a'.repeat(80)}@example.com`, 'abc123')
    expect(username).toBe(`${'a'.repeat(23)}_abc123`)
    expect(username).toHaveLength(30)
    // The cut must not leave a dangling underscore before the suffix.
    expect(deriveUsername(`${'a'.repeat(22)}.bcd@example.com`, 'abc123')).toBe(
      `${'a'.repeat(22)}_abc123`,
    )
  })

  it('splits on the last @ and tolerates input that is not an email', () => {
    expect(deriveUsername('a@b@example.com', 'abc123')).toBe('a_b_abc123')
    expect(deriveUsername('plainname', 'abc123')).toBe('plainname_abc123')
  })

  it('adds a random suffix by default, so the same email gives different usernames', () => {
    const usernames = new Set(Array.from({ length: 50 }, () => deriveUsername('ada@example.com')))
    expect(usernames.size).toBeGreaterThan(45)
    for (const username of usernames) {
      expect(username).toMatch(/^ada_[a-z0-9]{6}$/)
    }
  })

  it('always passes the sign-up username rule', () => {
    const emails = [
      'ada@example.com',
      'a@example.com',
      '_@example.com',
      '@example.com',
      '',
      '日本語@example.com',
      '!!!@example.com',
      'A.B.C.D@example.com',
      `${'x'.repeat(200)}@example.com`,
      `${'x_'.repeat(40)}@example.com`,
      'with space@example.com',
      'tab\t@example.com',
      'ünïcödé.user@example.com',
    ]
    for (const email of emails) {
      expect(isValid(deriveUsername(email)), email).toBe(true)
    }
  })
})
