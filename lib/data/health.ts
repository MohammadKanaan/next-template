import 'server-only'
import { logger } from '@/lib/server/logger'
import { getRedis } from '@/lib/server/redis'
import { db } from './db'

const log = logger.child({ module: 'health' })

export type HealthCheck = 'ok' | 'fail'
export type Health = {
  status: 'ok' | 'degraded'
  checks: { db: HealthCheck; redis: HealthCheck }
}

const CHECK_TIMEOUT_MS = 2000

/** Rejects when `probe` does not settle in time, so a hung dependency reads as a failure. */
const withTimeout = async (name: string, probe: () => Promise<unknown>): Promise<HealthCheck> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)),
      CHECK_TIMEOUT_MS,
    )
  })
  try {
    await Promise.race([probe(), timeout])
    return 'ok'
  } catch (error) {
    // The cause goes to the log only; the endpoint is public and must not reveal internals.
    log.error({ err: error, check: name }, 'check failed')
    return 'fail'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Liveness of the services the app cannot work without. Deliberately unauthenticated (load
 * balancers and container probes call it) and returns only ok/fail per dependency, never errors.
 */
export const checkHealth = async (): Promise<Health> => {
  const [dbCheck, redisCheck] = await Promise.all([
    withTimeout('db', () => db.$queryRaw`SELECT 1`),
    withTimeout('redis', () => getRedis().ping()),
  ])
  return {
    status: dbCheck === 'ok' && redisCheck === 'ok' ? 'ok' : 'degraded',
    checks: { db: dbCheck, redis: redisCheck },
  }
}
