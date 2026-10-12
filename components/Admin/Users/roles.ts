import { roleSchema, userStatusSchema, type Role, type UserStatus } from '@/lib/dto/users'

/** The role picker's options; also lets a Select trigger show the label instead of the value. */
export const ROLE_LABELS: Record<Role, string> = {
  user: 'User',
  admin: 'Admin',
}

/** How the confirmation toast names each role. */
export const ROLE_PHRASES: Record<Role, string> = {
  user: 'a regular user',
  admin: 'an admin',
}

/** The list filters: `''` is "any" (the URL default, so it is left out of the query string). */
export const ROLE_FILTER_LABELS: Record<Role | '', string> = {
  '': 'All roles',
  user: 'Users',
  admin: 'Admins',
}

export const ROLE_FILTERS: readonly (Role | '')[] = ['', ...roleSchema.options]

export const STATUS_FILTER_LABELS: Record<UserStatus | '', string> = {
  '': 'Any status',
  active: 'Active',
  banned: 'Banned',
}

export const STATUS_FILTERS: readonly (UserStatus | '')[] = ['', ...userStatusSchema.options]
