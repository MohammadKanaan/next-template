# Caching

There is one cache: the **Redis data cache** (`remember()` in `lib/server/cache.ts`), used inside
the DAL for data that is the same for every viewer. Next's Cache Components are off
(`cacheComponents` is not set), so `'use cache'`, `cacheTag` and `cacheLife` are not available; do
not turn them on to cache data, because a second cache is a copy that Redis invalidation cannot
reach. Caching is opt-in per DAL function: a new read works without `remember()`, add it when the
read is viewer independent and worth it.

How the DAL caches:

- `remember(key, { ttl, tags, schema }, load)`: reads the tag versions, builds a versioned key,
  returns the hit parsed with `schema` (the DTO's `z.coerce.date()` restores `Date`s), or runs
  `load()` and stores the JSON with a TTL. `invalidateTags(...tags)` bumps each tag's version, so
  old entries become unreachable at once and age out by TTL.
- Tags live in `lib/data/cacheTags.ts` (`POSTS_TAG`, `postTag(id)`, `commentsTag(id)`, `userTag(id)`).
- Check auth first, then `remember()` only the viewer-independent part, then compute viewer-specific
  fields (`permissions`) after. Never cache something that varies by viewer under a shared key.
- **Invalidate inside the DAL**, right after the write succeeds, so a caller cannot forget
  (`createPost` / `updatePost` / `deletePost`, `attachAvatar`; Better Auth user updates via its
  database hook). Actions still call `revalidatePath` / `refresh()` for the router cache.
- **Free-text search, date ranges, author lists and unknown tags are never cached.** `listPosts`
  skips `remember()` when `q`, `from`, `to` or `authorId` is set (high-cardinality, unbounded keys;
  the one author list in the UI is the viewer's own, which is viewer dependent anyway), when a
  `tag` is not among the published posts' tags (`listTags()`, itself cached and capped, so a caller
  cannot mint keys by inventing tags), and when a viewer-chosen status (anything but `published`)
  shaped the result. Unfiltered lists and lists of a known tag keep the cache (`sort` and the
  validated `tag` are part of their key). Search input is escaped for LIKE wildcards in the DAL.
- Cache keys are built from unambiguous parts (`JSON.stringify([...])`, as `listPosts` does), never
  by joining user-controlled strings, and every input that reaches a key is bounded in its DTO
  (`page`, `perPage`, `tag`), so a caller cannot collide with another entry or mint unlimited keys. The key space is bounded but
  large (`page` × `perPage` × `sort` × known tags); `remember()` entries have a TTL and Redis runs
  `volatile-lru`, so a flood evicts cache entries and rate-limit counters, never tag versions.
- Redis must be >= 7 (the rate limiter uses `PEXPIRE ... NX`). Run it with `maxmemory` and
  `maxmemory-policy volatile-lru`, as `docker-compose.yml` does: tag versions have no TTL and must
  not be evicted.
- Redis is an optimization, never a dependency: read, write, and invalidation errors are logged
  and the request falls through to the database. A `load()` that throws (e.g. `NotFoundError`) is
  never cached.
