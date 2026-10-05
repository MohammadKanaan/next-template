'use server'

import { APIError } from 'better-auth/api'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { auth } from '@/lib/data/auth'
import { parseInput, toActionFailure, ValidationError } from '@/lib/data/errors'
import { isUsernameTaken } from '@/lib/data/users'
import { signInInput, signUpInput, type SignInInput, type SignUpInput } from '@/lib/dto/auth'
import type { ActionResult } from '@/types/api'

export async function signInAction(input: SignInInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(signInInput, input)
    await auth.api.signInEmail({ body, headers: await headers() })
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    if (error instanceof APIError && error.status === 'UNAUTHORIZED') {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid email or password' }
    }
    return toActionFailure(error)
  }
}

export async function signUpAction(input: SignUpInput): Promise<ActionResult<null>> {
  try {
    const body = parseInput(signUpInput, input)
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
    return toActionFailure(error)
  }
}

export async function signOutAction(): Promise<ActionResult<null>> {
  await auth.api.signOut({ headers: await headers() })
  refresh()
  return { ok: true, data: null }
}
