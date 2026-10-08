import 'server-only'
import Redis, { type RedisOptions } from 'ioredis'
import { serverEnv } from './env'
import { logger } from './logger'

const log = logger.child({ module: 'redis' })

const createClient = (options: RedisOptions) => {
  const client = new Redis(serverEnv().REDIS_URL, {
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    ...options,
  })
  // Without a listener, a connection error is an unhandled 'error' event and crashes the process.
  client.on('error', (error) => log.error({ err: error }, 'connection error'))
  return client
}

const globalForRedis = globalThis as unknown as { redis?: Redis; redisSubscriber?: Redis }

/** Shared connection, created on first use so importing this file never needs REDIS_URL. */
export const getRedis = (): Redis => {
  globalForRedis.redis ??= createClient({
    // Redis is an optimization, never a dependency: fail a command fast instead of queueing it
    // behind a reconnect, so callers can fall through to the database.
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
  })
  return globalForRedis.redis
}

/**
 * The connection that `SUBSCRIBE`s (see `realtime.ts`). A subscribed connection accepts no other
 * command and waits for messages indefinitely, so it is separate from the shared client and has no
 * command timeout. ioredis re-subscribes its channels after a reconnect.
 */
export const getRedisSubscriber = (): Redis => {
  globalForRedis.redisSubscriber ??= createClient({})
  return globalForRedis.redisSubscriber
}
