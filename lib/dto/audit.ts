import { z } from 'zod'
import { pageQuerySchema } from './common'
import { userIdSchema } from './users'

export const auditActionSchema = z.enum([
  'post.create',
  'post.update',
  'post.status',
  'post.delete',
  'post.restore',
  'comment.delete',
  'user.role',
])

export type AuditAction = z.infer<typeof auditActionSchema>

/** What an entry is about; it is the part of the action before the dot. */
export const auditEntityTypeSchema = z.enum(['post', 'comment', 'user'])

export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>

/** The entity type of an action (`post.update` is about a `post`). */
export const auditEntityTypeOf = (action: AuditAction): AuditEntityType => {
  return auditEntityTypeSchema.parse(action.split('.')[0])
}

/**
 * Ids, changed field names and state names only (`{ from: 'draft', to: 'published' }`). Never a
 * title, a body or an email: the audit log outlives the records it describes.
 */
export const auditMetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
)

export type AuditMetadata = z.infer<typeof auditMetadataSchema>

/** Internal input of `recordAudit`: what a DAL function knows after its own checks. */
export const recordAuditInput = z.object({
  actorId: userIdSchema,
  action: auditActionSchema,
  entityId: z.coerce.string().min(1).max(64),
  metadata: auditMetadataSchema.optional(),
})

export type RecordAuditInput = z.input<typeof recordAuditInput>

/** The person who acted; `null` once their account is gone. */
export const auditActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
})

export const auditEntrySchema = z.object({
  id: z.number().int(),
  action: auditActionSchema,
  entityType: auditEntityTypeSchema,
  entityId: z.string(),
  metadata: auditMetadataSchema.nullable(),
  actor: auditActorSchema.nullable(),
  createdAt: z.coerce.date(),
})

export type AuditEntry = z.infer<typeof auditEntrySchema>

export const listAuditQuery = pageQuerySchema.extend({
  entityType: auditEntityTypeSchema.optional(),
  actorId: userIdSchema.optional(),
})

export type ListAuditQuery = z.infer<typeof listAuditQuery>

/** The tolerant URL contract of `/admin/audit` (see `postsUrlQuery`): any query string parses. */
export const auditUrlQuery = z.object({
  page: pageQuerySchema.shape.page.catch(1),
  /** `''` means no filter. */
  entityType: z.union([auditEntityTypeSchema, z.literal('')]).catch(''),
  actorId: z.union([userIdSchema, z.literal('')]).catch(''),
})
