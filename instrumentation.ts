/**
 * Runs once when a Next server starts. In production it validates the server env so a bad config
 * (an empty `REDIS_URL`, a half-set Google pair) stops the boot instead of silently disabling the
 * rate limiter or cache, and checks the auth secret and URL (`assertAuthEnv`). It stays off in
 * dev, tests and `next build`, which never need these variables.
 */
export const register = async () => {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { assertAuthEnv, serverEnv } = await import('@/lib/server/env')
    serverEnv()
    assertAuthEnv()
  }
}
