import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'

// Classifies the constraint violations PostgreSQL reports through the driver adapter, so a DAL
// function can turn a race it lost (a username taken between its check and its insert, an author
// deleted while their post is written) into a `ValidationError` instead of a 500. The
// constraint's name is where Prisma 7's adapter puts it (`driverAdapterError.cause.constraint`).

const constraintMeta = z.object({
  driverAdapterError: z.object({
    cause: z.object({ constraint: z.object({ index: z.string() }) }),
  }),
})

/** The name of the constraint a known request error violated, when the adapter reports one. */
const violatedConstraint = (error: Prisma.PrismaClientKnownRequestError): string | null => {
  const meta = constraintMeta.safeParse(error.meta)
  return meta.success ? meta.data.driverAdapterError.cause.constraint.index : null
}

const violates = (error: unknown, code: string, constraint: string | undefined) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === code &&
  (constraint === undefined || violatedConstraint(error) === constraint)

/** A unique constraint failed (P2002), optionally the one named (`users_username_key`). */
export const isUniqueViolation = (error: unknown, constraint?: string) =>
  violates(error, 'P2002', constraint)

/** A foreign key failed (P2003), optionally the one named (`posts_user_id_fkey`). */
export const isForeignKeyViolation = (error: unknown, constraint?: string) =>
  violates(error, 'P2003', constraint)
