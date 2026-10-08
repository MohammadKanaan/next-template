import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { toPage, type Page } from '@/lib/dto/common'
import {
  auditEntityTypeOf,
  auditEntrySchema,
  listAuditQuery,
  recordAuditInput,
  type AuditEntry,
  type ListAuditQuery,
  type RecordAuditInput,
} from '@/lib/dto/audit'
import { logger } from '@/lib/server/logger'
import { requireAdmin } from './auth'
import { db } from './db'
import { parseInput } from './errors'

const log = logger.child({ module: 'audit' })

/** Selects exactly the `AuditEntry` DTO. */
const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true, username: true } },
} satisfies Prisma.AuditLogSelect

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>

// Only `recordAudit` writes the table, so the parse is a guard against drift, not user input.
const toAuditEntry = (row: AuditRow): AuditEntry => auditEntrySchema.parse(row)

/**
 * Internal: no `requireUser()`. It is called by DAL write paths after their own checks and after
 * the write succeeded (`createPost`, `setUserRole`, ...), never from a page, action or handler; the
 * caller passes the actor. The entity type comes from the action. A failure is logged and
 * swallowed, because the change it describes is already saved. `metadata` holds ids and changed
 * field names only (see `auditMetadataSchema`); nothing of it is logged.
 */
export const recordAudit = async (entry: RecordAuditInput): Promise<void> => {
  try {
    const { actorId, action, entityId, metadata } = parseInput(recordAuditInput, entry)
    await db.auditLog.create({
      data: { actorId, action, entityType: auditEntityTypeOf(action), entityId, metadata },
    })
  } catch (error) {
    log.error({ err: error, action: entry.action }, 'audit entry not recorded')
  }
}

/**
 * Admin only: the audit log, newest first, optionally for one entity type or one actor. Never
 * cached: it is restricted to admins and an entry is only useful when it is current.
 */
export const listAuditLog = async (query: ListAuditQuery): Promise<Page<AuditEntry>> => {
  await requireAdmin()
  const { page, perPage, entityType, actorId } = parseInput(listAuditQuery, query)
  const where: Prisma.AuditLogWhereInput = { entityType, actorId }
  const [rows, totalItems] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: auditSelect,
      orderBy: { id: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.auditLog.count({ where }),
  ])
  return toPage(rows.map(toAuditEntry), totalItems, { page, perPage })
}
