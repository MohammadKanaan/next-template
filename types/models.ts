import type { Scalars } from '@prisma/orm-postgres/family-contract/types'
import type { Models } from '@/prisma/contract'

/**
 * Scalar columns of each Prisma model, generated from `prisma/contract.prisma`
 * (`bun run contract:emit`). These are the source of truth for every DTO: service
 * response types are derived from them, never written by hand.
 */
export type UserModel = Scalars<Models.public_User>
export type PostModel = Scalars<Models.public_Post>
