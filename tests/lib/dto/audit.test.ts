import { describe, expect, it } from 'vitest'
import {
  auditActionSchema,
  auditEntityTypeOf,
  auditEntrySchema,
  auditMetadataSchema,
  auditUrlQuery,
  listAuditQuery,
} from '@/lib/dto/audit'

describe('audit DTOs', () => {
  it('derives the entity type from every action', () => {
    expect(auditActionSchema.options.map(auditEntityTypeOf)).toEqual([
      'post',
      'post',
      'post',
      'post',
      'post',
      'comment',
      'user',
    ])
  })

  it('accepts ids, names and flags as metadata, and nothing nested', () => {
    expect(
      auditMetadataSchema.safeParse({ from: 'draft', version: 2, fields: ['title'] }).success,
    ).toBe(true)
    expect(auditMetadataSchema.safeParse({ body: { text: 'x' } }).success).toBe(false)
    expect(auditMetadataSchema.safeParse({ list: [1] }).success).toBe(false)
  })

  it('revives dates when parsing JSON', () => {
    const entry = auditEntrySchema.parse({
      id: 1,
      action: 'post.create',
      entityType: 'post',
      entityId: '3',
      metadata: null,
      actor: null,
      createdAt: '2026-10-08T10:00:00.000Z',
    })
    expect(entry.createdAt).toBeInstanceOf(Date)
  })

  it('validates the list query', () => {
    expect(listAuditQuery.parse({})).toEqual({ page: 1, perPage: 10 })
    expect(listAuditQuery.safeParse({ entityType: 'tag' }).success).toBe(false)
    expect(listAuditQuery.safeParse({ actorId: 'a b' }).success).toBe(false)
  })

  it('parses any URL into the default list', () => {
    expect(auditUrlQuery.parse({})).toEqual({ page: 1, entityType: '', actorId: '' })
    expect(auditUrlQuery.parse({ page: 'x', entityType: 'nope', actorId: '??' })).toEqual({
      page: 1,
      entityType: '',
      actorId: '',
    })
    expect(auditUrlQuery.parse({ page: '2', entityType: 'comment', actorId: 'u-1' })).toEqual({
      page: 2,
      entityType: 'comment',
      actorId: 'u-1',
    })
  })
})
