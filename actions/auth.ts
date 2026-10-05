'use server'

import { APIError } from 'better-auth/api'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { auth } from '@/lib/data/auth'
import { parseInput, toActionFailure, ValidationError } from '@/lib/data/errors'
import { consumeRateLimit, getClientIp, isRateLimitEnabled } from '@/lib/data/rateLimit'
import { isUsernameTaken } from '@/lib/data/users'
import { signInInput, signUpInput, type SignInInput, type SignUpInput } from '@/lib/dto/auth'
import type { ActionResult } from '@/types/api'

export async function signInAction(input: SignInInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(signInInput, input)
    if (isRateLimitEnabled()) {
      const ip = await getClientIp()
      await consumeRateLimit(`sign-in:ip:${ip}`, { max: 10, windowMs: 60_000 })
      await consumeRateLimit(`sign-in:email:${body.email}`, { max: 5, windowMs: 60_000 })
    }
    await auth.api.signInEmail({ body, headers: await headers() })
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        code: 'UNAUTHORIZED',
        message:
          error.status === 'UNAUTHORIZED'
            ? 'Invalid email or password'
            : 'Could not sign you in. Try again.',
      }
    }
    return toActionFailure(error)
  }
}

export async function signUpAction(input: SignUpInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(signUpInput, input)
    if (isRateLimitEnabled()) {
      await consumeRateLimit(`sign-up:ip:${await getClientIp()}`, { max: 5, windowMs: 60_000 })
    }
    if (await isUsernameTaken(body.username)) {
      throw new ValidationError({ username: ['That username is taken'] })
    }
    await auth.api.signUpEmail({ body, headers: await headers() })
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
      return toActionFailure(
        new ValidationError({ email: ['An account with this email already exists'] }),
      )
    }
    if (error instanceof APIError) {
      return { ok: false, code: 'VALIDATION', message: 'Could not create your account. Try again.' }
    }
    return toActionFailure(error)
  }
}

export async function signOutAction(): Promise<ActionResult<null>> {
  await auth.api.signOut({ headers: await headers() })
  refresh()
  return { ok: true, data: null }
}
