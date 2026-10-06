import 'server-only'
import Redis from 'ioredis'
import { serverEnv } from './env'
import { logger } from './logger'

const log = logger.child({ module: 'redis' })

function createClient() {
  const client = new Redis(serverEnv().REDIS_URL, {
    lazyConnect: true,
    // Redis is an optimization, never a dependency: fail a command fast instead of queueing it
    // behind a reconnect, so callers can fall through to the database.
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  })
  // Without a listener, a connection error is an unhandled 'error' event and crashes the process.
  client.on('error', (error) => log.error({ err: error }, 'connection error'))
  return client
}

const globalForRedis = globalThis as unknown as { redis?: Redis }

/** Shared connection, created on first use so importing this file never needs REDIS_URL. */
export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createClient()
  }
  return globalForRedis.redis
}
