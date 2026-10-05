import { z } from 'zod'

export const roleSchema = z.enum(['user', 'admin'])

export type Role = z.infer<typeof roleSchema>

/** What anyone may see about a user (e.g. a post's author). */
export const userProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  website: z.string().nullable(),
})

export type UserProfile = z.infer<typeof userProfileSchema>

/** The signed-in user's own record. */
export const currentUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: roleSchema,
})

export type CurrentUser = z.infer<typeof currentUserSchema>
