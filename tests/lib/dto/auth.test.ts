import { describe, expect, it } from 'vitest'
import { signInInput, signUpInput } from '@/lib/dto/auth'

describe('auth inputs', () => {
  it('normalises the email', () => {
    expect(signInInput.parse({ email: ' Leanne@Example.com ', password: 'x' }).email).toBe(
      'leanne@example.com',
    )
  })

  it('reports each invalid sign-up field', () => {
    const result = signUpInput.safeParse({
      name: '',
      username: 'A!',
      email: 'nope',
      password: 'short',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'name',
      'username',
      'username',
      'email',
      'password',
    ])
  })
})
