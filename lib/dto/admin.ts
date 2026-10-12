import { z } from 'zod'
import { postSummarySchema } from './posts'
import { adminUserSchema } from './users'

/** One of a user's sessions as the admin sees it. Never the token: it is the credential. */
export const adminSessionSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
})

export type AdminSession = z.infer<typeof adminSessionSchema>

/** The admin's view of one user: the list row plus their image, active sessions and recent posts. */
export const adminUserDetailSchema = adminUserSchema.extend({
  image: z.string().nullable(),
  updatedAt: z.coerce.date(),
  sessions: z.array(adminSessionSchema),
  postCount: z.number().int(),
  /** Their newest posts, drafts included (at most `ADMIN_USER_POSTS`). */
  posts: z.array(postSummarySchema),
})

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>

/** How many of a user's posts the detail carries. */
export const ADMIN_USER_POSTS = 10
/** How many recent rows the overview carries. */
export const ADMIN_OVERVIEW_RECENT = 5

const count = z.number().int().nonnegative()

/** The dashboard's front page: counts and what was added last. Admin only, never cached. */
export const adminOverviewSchema = z.object({
  counts: z.object({
    users: count,
    admins: count,
    banned: count,
    posts: count,
    drafts: count,
  }),
  recentPosts: z.array(postSummarySchema),
  recentUsers: z.array(adminUserSchema),
})

export type AdminOverview = z.infer<typeof adminOverviewSchema>
