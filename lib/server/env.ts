import 'server-only'
import { z } from 'zod'

/** An empty variable (`FOO=`, common in compose and CI templates) counts as unset. */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const serverEnvSchema = z
  .object({
    REDIS_URL: z.string().min(1),
    // Optional: without it the mailer logs emails to the console instead of sending them.
    // Production refuses to send without it (see `sendMail`).
    RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    EMAIL_FROM: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_PUBLIC_URL: z.url(),
    // Optional: the S3 endpoint as the browser reaches it, for presigned uploads. Defaults to
    // `S3_ENDPOINT`; set it when the server talks to storage over an internal host (e.g. a container
    // name) the browser cannot resolve.
    S3_PUBLIC_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
    // Optional pair: Google sign-in is on only when both are set. `lib/data/auth.ts` reads them from
    // `process.env` itself (the auth config is built at import time); they are listed here so a
    // half-configured provider fails at boot in production.
    GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
    path: ['GOOGLE_CLIENT_ID'],
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

/**
 * Validated server-side config from `process.env`, parsed on first use and memoized. It is lazy so
 * `next build` (which never touches Redis, S3, or the mailer) works without these variables.
 * Throws one readable error that lists every missing or invalid variable.
 */
export const serverEnv = (): ServerEnv => {
  if (cached) {
    return cached
  }
  const result = serverEnvSchema.safeParse(process.env)
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid server environment variables:\n${problems}`)
  }
  cached = result.data
  return cached
}

/** Clears the memoized env; for tests. */
export const resetServerEnv = () => {
  cached = undefined
}
