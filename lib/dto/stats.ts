import { z } from 'zod'
import { postStatusSchema } from './posts'

export const POSTS_PER_DAY_DEFAULT = 30
/** Caps `days` so callers cannot mint unbounded cache keys or ask for an enormous series. */
export const POSTS_PER_DAY_MAX = 90

/** Site-wide numbers about published content; the same for every viewer. */
export const siteStatsSchema = z.object({
  publishedPosts: z.number().int(),
  comments: z.number().int(),
  tags: z.number().int(),
})

export type SiteStats = z.infer<typeof siteStatsSchema>

/** Every status is a key (zero when the viewer has no post in it). */
export const postStatusCountsSchema = z.record(postStatusSchema, z.number().int())

export type PostStatusCounts = z.infer<typeof postStatusCountsSchema>

/** The viewer's own numbers: their posts by status and what other people said on them. */
export const myStatsSchema = z.object({
  posts: postStatusCountsSchema,
  commentsReceived: z.number().int(),
})

export type MyStats = z.infer<typeof myStatsSchema>

export const postsPerDayInput = z.object({
  days: z.number().int().min(1).max(POSTS_PER_DAY_MAX).default(POSTS_PER_DAY_DEFAULT),
})

/** One calendar day (UTC, `YYYY-MM-DD`) and how many posts were published on it. */
export const dailyPostCountSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int(),
})

export type DailyPostCount = z.infer<typeof dailyPostCountSchema>

export const dailyPostCountsSchema = z.array(dailyPostCountSchema)

/** A row of the raw `getPostsPerDay` query: Postgres counts arrive as `bigint`. */
export const dailyPostCountRowSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.bigint().transform(Number),
})
