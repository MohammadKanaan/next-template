import 'server-only'
import type { z } from 'zod'
import { getRedis } from './redis'

const TAG_PREFIX = 'cache:tag:'
const KEY_PREFIX = 'cache:v:'

type RememberOptions<S extends z.ZodType> = {
  /** Seconds before the entry expires on its own. */
  ttl: number
  /** Tags whose invalidation drops this entry. */
  tags: string[]
  /** Validates (and, via `z.coerce.date()`, revives) what comes back out of JSON. */
  schema: S
}

function versionedKey(key: string, tags: string[], versions: (string | null)[]) {
  const suffix = tags.map((tag, index) => `${tag}=${versions[index] ?? 0}`).join(',')
  return `${KEY_PREFIX}${key}|${suffix}`
}

/**
 * Read-through Redis cache. The key embeds the current version of every tag, so
 * `invalidateTags` makes old entries unreachable at once (they age out by TTL). Any Redis or
 * parse failure is logged and falls through to `load()`: the cache never breaks a request.
 * Only cache data that is the same for every viewer; check auth before calling this.
 */
export async function remember<S extends z.ZodType>(
  key: string,
  { ttl, tags, schema }: RememberOptions<S>,
  load: () => Promise<z.output<S>>,
): Promise<z.output<S>> {
  let cacheKey: string | null = null
  try {
    const redis = getRedis()
    const versions = tags.length > 0 ? await redis.mget(tags.map((tag) => TAG_PREFIX + tag)) : []
    cacheKey = versionedKey(key, tags, versions)
    const hit = await redis.get(cacheKey)
    if (hit !== null) {
      return schema.parse(JSON.parse(hit))
    }
  } catch (error) {
    console.error('[cache] read failed, loading from source:', error)
  }

  const value = await load()

  if (cacheKey !== null) {
    try {
      await getRedis().set(cacheKey, JSON.stringify(value), 'EX', ttl)
    } catch (error) {
      console.error('[cache] write failed:', error)
    }
  }
  return value
}

/** Bumps each tag's version, atomically; entries cached under the old version are never read. */
export async function invalidateTags(...tags: string[]): Promise<void> {
  if (tags.length === 0) {
    return
  }
  try {
    const pipeline = getRedis().multi()
    for (const tag of tags) {
      pipeline.incr(TAG_PREFIX + tag)
    }
    const results = await pipeline.exec()
    const failed = results?.find(([error]) => error)
    if (failed?.[0]) {
      throw failed[0]
    }
  } catch (error) {
    console.error('[cache] invalidation failed:', error)
  }
}
