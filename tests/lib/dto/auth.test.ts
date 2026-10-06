import { describe, expect, it } from 'vitest'
import {
  changeEmailInput,
  changePasswordInput,
  deleteAccountInput,
  signInInput,
  signUpInput,
} from '@/lib/dto/auth'

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

describe('account inputs', () => {
  it('requires the current password and a valid new one', () => {
    expect(
      changePasswordInput.parse({ currentPassword: 'x', newPassword: 'long-enough-1' }),
    ).toEqual({ currentPassword: 'x', newPassword: 'long-enough-1' })
    const result = changePasswordInput.safeParse({ currentPassword: '', newPassword: 'short' })
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'currentPassword',
      'newPassword',
    ])
  })

  it('normalises and validates the new email', () => {
    expect(changeEmailInput.parse({ newEmail: ' New@Example.com ' }).newEmail).toBe(
      'new@example.com',
    )
    expect(changeEmailInput.safeParse({ newEmail: 'nope' }).success).toBe(false)
    expect(changeEmailInput.safeParse({ newEmail: '' }).success).toBe(false)
  })

  it('requires a password to delete the account', () => {
    expect(deleteAccountInput.parse({ password: 'x' })).toEqual({ password: 'x' })
    expect(deleteAccountInput.safeParse({ password: '' }).success).toBe(false)
  })
})
