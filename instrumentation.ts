/**
 * Runs once when a Next server starts. In production it validates the server env so a bad config
 * (an empty `REDIS_URL`, a malformed S3 endpoint) stops the boot instead of silently disabling the
 * rate limiter, cache or uploads. It stays off in dev, tests and `next build`, which never need
 * these variables.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { serverEnv } = await import('@/lib/server/env')
    serverEnv()
  }
}
