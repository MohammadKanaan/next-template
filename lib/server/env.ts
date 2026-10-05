import 'server-only'
import { z } from 'zod'

const serverEnvSchema = z.object({
  REDIS_URL: z.string().min(1),
  // Optional: without it the mailer logs emails to the console instead of sending them.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_PUBLIC_URL: z.url(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

/**
 * Validated server-side config from `process.env`, parsed on first use and memoized. It is lazy so
 * `next build` (which never touches Redis, S3, or the mailer) works without these variables.
 * Throws one readable error that lists every missing or invalid variable.
 */
export function serverEnv(): ServerEnv {
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
export function resetServerEnv() {
  cached = undefined
}
