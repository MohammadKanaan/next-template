'use server'

import { APIError } from 'better-auth/api'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { ROUTE_RESET_PASSWORD } from '@/lib/constants-routes'
import { auth } from '@/lib/data/auth'
import { parseInput, toActionFailure, ValidationError } from '@/lib/data/errors'
import { consumeRateLimit, getClientIp, isRateLimitEnabled } from '@/lib/data/rateLimit'
import { getCurrentUser, isUsernameTaken } from '@/lib/data/users'
import {
  requestPasswordResetInput,
  resetPasswordInput,
  signInInput,
  signUpInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from '@/lib/dto/auth'
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

/**
 * Always `ok` for a well-formed email, whether or not an account exists, so the form cannot be
 * used to find out who has one. The email itself is sent by a background job.
 */
export async function requestPasswordResetAction(
  input: RequestPasswordResetInput,
): Promise<ActionResult<null>> {
  try {
    const body = parseInput(requestPasswordResetInput, input)
    if (isRateLimitEnabled()) {
      const ip = await getClientIp()
      await consumeRateLimit(`password-reset:ip:${ip}`, { max: 10, windowMs: 60_000 })
      await consumeRateLimit(`password-reset:email:${body.email}`, { max: 3, windowMs: 60_000 })
    }
    await auth.api.requestPasswordReset({
      body: { email: body.email, redirectTo: ROUTE_RESET_PASSWORD },
    })
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError) {
      return { ok: false, code: 'VALIDATION', message: 'Could not send the email. Try again.' }
    }
    return toActionFailure(error)
  }
}

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(resetPasswordInput, input)
    if (isRateLimitEnabled()) {
      await consumeRateLimit(`reset-password:ip:${await getClientIp()}`, {
        max: 10,
        windowMs: 60_000,
      })
    }
    await auth.api.resetPassword({
      body: { token: body.token, newPassword: body.password },
      headers: await headers(),
    })
    // Every session was revoked, including this browser's if it was signed in.
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'INVALID_TOKEN') {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'This reset link is invalid or has expired. Request a new one.',
      }
    }
    if (error instanceof APIError) {
      return { ok: false, code: 'VALIDATION', message: 'Could not reset your password. Try again.' }
    }
    return toActionFailure(error)
  }
}

/** Sends the signed-in user a fresh verification email. */
export async function resendVerificationAction(): Promise<ActionResult<null>> {
  try {
    const user = await getCurrentUser()
    if (isRateLimitEnabled()) {
      await consumeRateLimit(`resend-verification:user:${user.id}`, { max: 3, windowMs: 60_000 })
    }
    await auth.api.sendVerificationEmail({
      body: { email: user.email },
      headers: await headers(),
    })
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'EMAIL_ALREADY_VERIFIED') {
      refresh()
      return { ok: true, data: null }
    }
    if (error instanceof APIError) {
      return { ok: false, code: 'VALIDATION', message: 'Could not send the email. Try again.' }
    }
    return toActionFailure(error)
  }
}
