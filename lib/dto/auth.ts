import { z } from 'zod'

/** Better Auth's defaults; `lib/data/auth.ts` passes the minimum through. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .pipe(z.email('Enter a valid email address'))

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`)

export const signInInput = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

export type SignInInput = z.infer<typeof signInInput>

export const signUpInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, and underscores'),
  email,
  password,
})

export type SignUpInput = z.infer<typeof signUpInput>

export const requestPasswordResetInput = z.object({ email })

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInput>

export const resetPasswordInput = z.object({
  token: z.string().min(1, 'This reset link is invalid'),
  password,
})

export type ResetPasswordInput = z.infer<typeof resetPasswordInput>
