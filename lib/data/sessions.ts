import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import type { SessionSummary } from '@/lib/dto/users'
import { requireUser } from './auth'
import { db } from './db'
import { NotFoundError } from './errors'

/** Never the token: it is the credential. */
const sessionSummarySelect = {
  id: true,
  userAgent: true,
  ipAddress: true,
  createdAt: true,
  expiresAt: true,
} satisfies Prisma.SessionSelect

/**
 * Sessions are plain database rows (there is no cookie cache), so deleting a row ends that
 * session on its next request.
 */

/** The viewer's own unexpired sessions, newest first; `current` marks the one making this call. */
export async function listSessions(): Promise<SessionSummary[]> {
  const viewer = await requireUser()
  const rows = await db.session.findMany({
    where: { userId: viewer.id, expiresAt: { gt: new Date() } },
    select: sessionSummarySelect,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((row) => ({ ...row, current: row.id === viewer.sessionId }))
}

/** Signed in, then the session must be the viewer's own (anything else reads as missing). */
export async function revokeSession(id: string): Promise<void> {
  const viewer = await requireUser()
  const result = await db.session.deleteMany({ where: { id, userId: viewer.id } })
  if (result.count === 0) {
    throw new NotFoundError('Session not found')
  }
}

/** Ends every session of the viewer except the one making the call. */
export async function revokeOtherSessions(): Promise<void> {
  const viewer = await requireUser()
  await db.session.deleteMany({ where: { userId: viewer.id, id: { not: viewer.sessionId } } })
}
