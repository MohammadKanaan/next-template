import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { PostStatus } from '@/lib/dto/posts'
import {
  dailyPostCountRowSchema,
  dailyPostCountsSchema,
  myStatsSchema,
  postsPerDayInput,
  siteStatsSchema,
  type DailyPostCount,
  type MyStats,
  type SiteStats,
} from '@/lib/dto/stats'
import { remember } from '@/lib/server/cache'
import { requireUser } from './auth'
import { POSTS_TAG, userTag } from './cacheTags'
import { db } from './db'
import { parseInput } from './errors'

const STATS_CACHE_TTL = 300

const published = { status: 'published' } satisfies Prisma.PostWhereInput

/** Published posts, the comments on them and the tags they use. Public and the same for everyone. */
export const getSiteStats = async (): Promise<SiteStats> => {
  return remember(
    'stats:site',
    { ttl: STATS_CACHE_TTL, tags: [POSTS_TAG], schema: siteStatsSchema },
    async () => {
      const [publishedPosts, comments, tags] = await Promise.all([
        db.post.count({ where: published }),
        db.comment.count({ where: { post: published } }),
        db.tag.count({ where: { posts: { some: { post: published } } } }),
      ])
      return { publishedPosts, comments, tags }
    },
  )
}

/**
 * The viewer's posts per status (every status is present, zero when empty) and the comments other
 * people left on those posts. The session is checked first; the cached entry is per user, so one
 * viewer's numbers can never reach another.
 */
export const getMyStats = async (): Promise<MyStats> => {
  const viewer = await requireUser()
  return remember(
    `user:${viewer.id}:stats`,
    { ttl: STATS_CACHE_TTL, tags: [POSTS_TAG, userTag(viewer.id)], schema: myStatsSchema },
    async () => {
      const [groups, commentsReceived] = await Promise.all([
        db.post.groupBy({
          by: ['status'],
          where: { userId: viewer.id },
          _count: { _all: true },
        }),
        db.comment.count({ where: { post: { userId: viewer.id }, userId: { not: viewer.id } } }),
      ])
      const countOf = (status: PostStatus) => {
        return groups.find((group) => group.status === status)?._count._all ?? 0
      }
      const posts = {
        draft: countOf('draft'),
        published: countOf('published'),
        archived: countOf('archived'),
      }
      return { posts, commentsReceived }
    },
  )
}

/**
 * Published posts per calendar day (UTC, by `publishedAt`) for the last `days` days, today
 * included, oldest first. Days without a post are present with a count of zero.
 *
 * This is the template's raw SQL example: `generate_series` builds the days, which a `groupBy`
 * cannot do. Raw queries use the tagged template only, so every value is bound as a parameter and
 * nothing is concatenated into the SQL, and the rows are parsed with a schema before they leave
 * (Postgres returns counts as `bigint`).
 */
export const getPostsPerDay = async (days?: number): Promise<DailyPostCount[]> => {
  const { days: windowDays } = parseInput(postsPerDayInput, { days })
  // The series ends today, so today's UTC date is part of the key: after midnight the cached
  // series that ends yesterday is never read again.
  const today = new Date().toISOString().slice(0, 10)
  return remember(
    JSON.stringify(['stats:posts-per-day', windowDays, today]),
    { ttl: STATS_CACHE_TTL, tags: [POSTS_TAG], schema: dailyPostCountsSchema },
    async () => {
      const rows = await db.$queryRaw<unknown[]>`
        SELECT to_char(series.day, 'YYYY-MM-DD') AS day, count(p.id) AS count
        FROM generate_series(
          date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${windowDays - 1}::int),
          date_trunc('day', now() AT TIME ZONE 'UTC'),
          interval '1 day'
        ) AS series(day)
        LEFT JOIN posts p
          ON p.status = 'published'
          AND date_trunc('day', p.published_at AT TIME ZONE 'UTC') = series.day
        GROUP BY series.day
        ORDER BY series.day`
      return rows.map((row) => {
        const { day, count } = dailyPostCountRowSchema.parse(row)
        return { date: day, count }
      })
    },
  )
}
