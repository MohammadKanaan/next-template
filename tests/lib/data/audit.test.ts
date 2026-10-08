// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAuditLog, recordAudit } from '@/lib/data/audit'
import { createComment, deleteComment } from '@/lib/data/comments'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { createPost, deletePost, restorePost, setPostStatus, updatePost } from '@/lib/data/posts'
import { setUserRole } from '@/lib/data/users'
import { getRedis } from '@/lib/server/redis'
import { createUser, resetDatabase, signInAs, signOut } from '../../helpers/server'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => log } }))

const entries = () => db.auditLog.findMany({ orderBy: { id: 'asc' } })

describe('audit log', () => {
  beforeEach(resetDatabase)
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  describe('recordAudit', () => {
    it('writes one entry and derives the entity type from the action', async () => {
      const actor = await createUser({})
      await recordAudit({
        actorId: actor.id,
        action: 'post.status',
        entityId: 7,
        metadata: { from: 'draft', to: 'published' },
      })
      expect(await entries()).toEqual([
        expect.objectContaining({
          actorId: actor.id,
          action: 'post.status',
          entityType: 'post',
          entityId: '7',
          metadata: { from: 'draft', to: 'published' },
        }),
      ])
    })

    it('stores no metadata as null', async () => {
      const actor = await createUser({})
      await recordAudit({ actorId: actor.id, action: 'post.delete', entityId: 1 })
      expect((await entries())[0].metadata).toBeNull()
    })

    it('logs and swallows a failure, with nothing but the action in the log', async () => {
      const actor = await createUser({})
      vi.spyOn(db.auditLog, 'create').mockRejectedValueOnce(new Error('db down'))
      await expect(
        recordAudit({
          actorId: actor.id,
          action: 'user.role',
          entityId: 'u1',
          metadata: { secret: 'do-not-log' },
        }),
      ).resolves.toBeUndefined()
      expect(log.error).toHaveBeenCalledWith(
        { err: expect.any(Error), action: 'user.role' },
        'audit entry not recorded',
      )
    })

    it('rejects an unknown action and a metadata value that is not plain, without throwing', async () => {
      const actor = await createUser({})
      await recordAudit({ actorId: actor.id, action: 'post.nuke' as 'post.delete', entityId: 1 })
      await recordAudit({
        actorId: actor.id,
        action: 'post.update',
        entityId: 1,
        metadata: { body: { nested: 'object' } as unknown as string },
      })
      expect(await entries()).toEqual([])
      expect(log.error).toHaveBeenCalledTimes(2)
    })
  })

  describe('listAuditLog', () => {
    it('requires an admin: 401 signed out, 403 for a regular user', async () => {
      signOut()
      await expect(listAuditLog({ page: 1, perPage: 10 })).rejects.toBeInstanceOf(UnauthorizedError)
      const member = await createUser({})
      await signInAs(member)
      await expect(listAuditLog({ page: 1, perPage: 10 })).rejects.toBeInstanceOf(ForbiddenError)
    })

    it('lists newest first with the actor, paginated', async () => {
      const admin = await createUser({ role: 'admin', name: 'Ada', username: 'ada' })
      for (const id of [1, 2, 3]) {
        await recordAudit({ actorId: admin.id, action: 'post.create', entityId: id })
      }
      await signInAs(admin)
      const first = await listAuditLog({ page: 1, perPage: 2 })
      expect(first).toMatchObject({ page: 1, perPage: 2, totalItems: 3, totalPages: 2 })
      expect(first.items.map((entry) => entry.entityId)).toEqual(['3', '2'])
      expect(first.items[0]).toMatchObject({
        action: 'post.create',
        entityType: 'post',
        metadata: null,
        actor: { id: admin.id, name: 'Ada', username: 'ada' },
      })
      expect(first.items[0].createdAt).toBeInstanceOf(Date)
      expect((await listAuditLog({ page: 2, perPage: 2 })).items.map((e) => e.entityId)).toEqual([
        '1',
      ])
      await expect(listAuditLog({ page: 0, perPage: 2 })).rejects.toBeInstanceOf(ValidationError)
    })

    it('filters by entity type and by actor', async () => {
      const admin = await createUser({ role: 'admin' })
      const other = await createUser({})
      await recordAudit({ actorId: admin.id, action: 'post.create', entityId: 1 })
      await recordAudit({ actorId: other.id, action: 'comment.delete', entityId: 2 })
      await recordAudit({ actorId: other.id, action: 'user.role', entityId: 'u1' })
      await signInAs(admin)
      const types = async (query: { entityType?: 'post' | 'comment' | 'user'; actorId?: string }) =>
        (await listAuditLog({ page: 1, perPage: 10, ...query })).items.map((e) => e.entityType)
      expect(await types({ entityType: 'comment' })).toEqual(['comment'])
      expect(await types({ actorId: other.id })).toEqual(['user', 'comment'])
      expect(await types({ actorId: other.id, entityType: 'user' })).toEqual(['user'])
      expect(await types({ actorId: 'nobody' })).toEqual([])
    })

    it('keeps an entry when its actor is deleted, with no actor', async () => {
      const admin = await createUser({ role: 'admin' })
      const gone = await createUser({})
      await recordAudit({ actorId: gone.id, action: 'post.create', entityId: 1 })
      await db.user.delete({ where: { id: gone.id } })
      await signInAs(admin)
      const [entry] = (await listAuditLog({ page: 1, perPage: 10 })).items
      expect(entry).toMatchObject({ action: 'post.create', actor: null })
    })
  })

  describe('write paths', () => {
    it('records post.create with no metadata', async () => {
      const author = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'Secret title', body: 'Secret body', tags: ['tag'] })
      expect(await entries()).toEqual([
        expect.objectContaining({
          actorId: author.id,
          action: 'post.create',
          entityType: 'post',
          entityId: String(post.id),
          metadata: null,
        }),
      ])
    })

    it('records post.update with the changed field names and the new version, never the text', async () => {
      const author = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'Secret title', body: 'Secret body' })
      await db.auditLog.deleteMany()
      const updated = await updatePost(post.id, {
        version: post.version,
        title: 'Another secret',
        tags: ['new'],
      })
      const [entry] = await entries()
      expect(entry).toMatchObject({
        actorId: author.id,
        action: 'post.update',
        entityId: String(post.id),
        metadata: { fields: ['title', 'tags'], version: updated.version },
      })
      expect(JSON.stringify(entry)).not.toMatch(/secret/i)
    })

    it('records post.status with the move, post.delete and post.restore', async () => {
      const author = await createUser({})
      await signInAs(author)
      const post = await createPost({ title: 'T', body: 'B' })
      await db.auditLog.deleteMany()

      await setPostStatus(post.id, 'published')
      await deletePost(post.id)
      await restorePost(post.id)

      expect(
        (await entries()).map(({ action, entityId, metadata }) => [action, entityId, metadata]),
      ).toEqual([
        ['post.status', String(post.id), { from: 'draft', to: 'published' }],
        ['post.delete', String(post.id), null],
        ['post.restore', String(post.id), null],
      ])
    })

    it('records the admin as the actor when an admin changes someone else’s post', async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await db.post.create({ data: { userId: author.id, title: 'T', body: 'B' } })
      await signInAs(admin)
      await deletePost(post.id)
      expect(await entries()).toEqual([
        expect.objectContaining({ actorId: admin.id, action: 'post.delete' }),
      ])
    })

    it('records comment.delete with the ids, never the comment', async () => {
      const author = await createUser({})
      const commenter = await createUser({})
      const post = await db.post.create({
        data: { userId: author.id, title: 'T', body: 'B', status: 'published' },
      })
      await signInAs(commenter)
      const comment = await createComment(post.id, { body: 'Private words' })
      await signInAs(author)
      await deleteComment(comment.id)
      const [entry] = await entries()
      expect(entry).toMatchObject({
        actorId: author.id,
        action: 'comment.delete',
        entityType: 'comment',
        entityId: String(comment.id),
        metadata: { postId: post.id, authorId: commenter.id },
      })
      expect(JSON.stringify(entry)).not.toContain('Private')
    })

    it('records user.role with the old and new role, never the email', async () => {
      const target = await createUser({ email: 'target@example.com' })
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await setUserRole({ id: target.id, role: 'admin' })
      await setUserRole({ id: target.id, role: 'user' })
      const all = await entries()
      expect(
        all.map((entry) => [entry.action, entry.entityType, entry.entityId, entry.metadata]),
      ).toEqual([
        ['user.role', 'user', target.id, { from: 'user', to: 'admin' }],
        ['user.role', 'user', target.id, { from: 'admin', to: 'user' }],
      ])
      expect(JSON.stringify(all)).not.toContain('target@example.com')
    })

    it('records nothing for a write that is refused', async () => {
      const author = await createUser({})
      const stranger = await createUser({})
      const post = await db.post.create({
        data: { userId: author.id, title: 'T', body: 'B', status: 'published' },
      })
      await signInAs(stranger)
      await expect(deletePost(post.id)).rejects.toBeInstanceOf(ForbiddenError)
      await expect(setPostStatus(post.id, 'archived')).rejects.toBeInstanceOf(ForbiddenError)
      await expect(deletePost(9999)).rejects.toBeInstanceOf(NotFoundError)
      await expect(setUserRole({ id: author.id, role: 'admin' })).rejects.toBeInstanceOf(
        ForbiddenError,
      )
      await expect(deleteComment(9999)).rejects.toBeInstanceOf(NotFoundError)
      expect(await entries()).toEqual([])
    })

    it('does not fail the write when the audit entry cannot be saved', async () => {
      const author = await createUser({})
      await signInAs(author)
      vi.spyOn(db.auditLog, 'create').mockRejectedValue(new Error('db down'))
      const post = await createPost({ title: 'T', body: 'B' })
      expect(post.id).toEqual(expect.any(Number))
      expect(await db.post.count()).toBe(1)
      expect(log.error).toHaveBeenCalled()
    })
  })
})
