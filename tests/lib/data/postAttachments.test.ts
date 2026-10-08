// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { getPost } from '@/lib/data/posts'
import { attachPostUpload, detachPostUpload } from '@/lib/data/uploads'
import { objectDeleteDelaySeconds, POST_ATTACHMENTS_MAX } from '@/lib/dto/uploads'
import { enqueue } from '@/lib/server/queue'
import { deleteObject, headObject } from '@/lib/server/storage'
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
vi.mock('@/lib/server/storage', () => ({
  createUploadTicket: vi.fn(),
  headObject: vi.fn(async () => ({ size: 2048, contentType: 'application/pdf' })),
  deleteObject: vi.fn(async () => {}),
  publicUrl: (key: string) => `http://storage.test/bucket/${key}`,
}))

const deleteJobs = () => vi.mocked(enqueue).mock.calls.filter(([name]) => name === 'delete-object')

const seedPost = (
  userId: string,
  extra: { status?: 'draft' | 'published'; deletedAt?: Date } = {},
) => {
  return db.post.create({
    data: { userId, title: 'Post', body: 'Body', status: extra.status ?? 'published', ...extra },
  })
}

const pendingUpload = (
  userId: string,
  name = 'report.pdf',
  purpose: 'attachment' | 'avatar' = 'attachment',
) => {
  return db.upload.create({
    data: {
      key: `${purpose}s/${userId}/${crypto.randomUUID()}`,
      userId,
      purpose,
      contentType: 'application/pdf',
      size: 1,
      name: purpose === 'attachment' ? name : null,
    },
  })
}

describe('post attachments DAL', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(enqueue).mockClear()
    vi.mocked(deleteObject).mockClear()
    vi.mocked(headObject).mockResolvedValue({ size: 2048, contentType: 'application/pdf' })
  })
  afterAll(async () => {
    await getRedis().quit()
    await db.$disconnect()
  })

  describe('attachPostUpload', () => {
    it('checks sign-in, then the post, then the permission, then the upload', async () => {
      const author = await createUser({})
      const stranger = await createUser({})
      const post = await seedPost(author.id)
      const upload = await pendingUpload(stranger.id)

      signOut()
      await expect(attachPostUpload(999, crypto.randomUUID())).rejects.toBeInstanceOf(
        UnauthorizedError,
      )

      await signInAs(stranger)
      // A missing post is 404 before the upload is looked at; an existing one is 403 for a stranger.
      await expect(attachPostUpload(999, upload.id)).rejects.toBeInstanceOf(NotFoundError)
      await expect(attachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(ForbiddenError)
      const draft = await seedPost(author.id, { status: 'draft' })
      await expect(attachPostUpload(draft.id, upload.id)).rejects.toBeInstanceOf(ForbiddenError)

      await signInAs(author)
      await expect(attachPostUpload(post.id, crypto.randomUUID())).rejects.toBeInstanceOf(
        NotFoundError,
      )
      // Someone else's upload is 403, even on the viewer's own post.
      await expect(attachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(ForbiddenError)
      expect(headObject).not.toHaveBeenCalled()
      expect(await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        status: 'pending',
        postId: null,
      })
    })

    it('validates its inputs', async () => {
      await signInAs(await createUser({}))
      await expect(attachPostUpload('abc', crypto.randomUUID())).rejects.toBeInstanceOf(
        ValidationError,
      )
      await expect(attachPostUpload(1, 'not-a-uuid')).rejects.toBeInstanceOf(ValidationError)
    })

    it('answers 404 for a trashed post, and the upload stays pending', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, { deletedAt: new Date() })
      const upload = await pendingUpload(author.id)
      await signInAs(author)
      await expect(attachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(NotFoundError)
      expect((await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
        'pending',
      )
    })

    it('refuses an avatar upload, and one that was already used', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const avatar = await pendingUpload(author.id, 'me.png', 'avatar')
      await expect(attachPostUpload(post.id, avatar.id)).rejects.toBeInstanceOf(NotFoundError)

      const upload = await pendingUpload(author.id)
      await attachPostUpload(post.id, upload.id)
      await expect(attachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(ValidationError)
    })

    it('attaches, returns the attachment and shows it on the post', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const upload = await pendingUpload(author.id, 'report.pdf')
      await signInAs(author)

      const attachment = await attachPostUpload(post.id, upload.id)

      expect(attachment).toEqual({
        id: upload.id,
        name: 'report.pdf',
        url: `http://storage.test/bucket/${upload.key}`,
        contentType: 'application/pdf',
        size: 2048,
        createdAt: expect.any(Date),
      })
      expect(await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        status: 'attached',
        postId: post.id,
        size: 2048,
      })
      signOut()
      const detail = await getPost(post.id)
      expect(detail.attachments).toEqual([attachment])
    })

    it('refreshes the cached post, and does not bump its version', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      expect((await getPost(post.id)).attachments).toEqual([])
      const upload = await pendingUpload(author.id)

      await attachPostUpload(post.id, upload.id)

      const detail = await getPost(post.id)
      expect(detail.attachments).toHaveLength(1)
      expect(detail.version).toBe(1)
    })

    it("lets an admin attach their own upload to someone else's post", async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      const upload = await pendingUpload(admin.id)
      await signInAs(admin)
      await attachPostUpload(post.id, upload.id)
      expect((await getPost(post.id)).attachments).toHaveLength(1)
    })

    it('keeps drafts private: the attachments of a draft are not readable by a stranger', async () => {
      const author = await createUser({})
      const stranger = await createUser({})
      const post = await seedPost(author.id, { status: 'draft' })
      const upload = await pendingUpload(author.id)
      await signInAs(author)
      await attachPostUpload(post.id, upload.id)
      await signInAs(stranger)
      await expect(getPost(post.id)).rejects.toBeInstanceOf(NotFoundError)
    })

    it('lists attachments oldest first', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      const first = await pendingUpload(author.id, 'a.pdf')
      const second = await pendingUpload(author.id, 'b.pdf')
      await attachPostUpload(post.id, first.id)
      await attachPostUpload(post.id, second.id)
      expect((await getPost(post.id)).attachments.map((item) => item.name)).toEqual([
        'a.pdf',
        'b.pdf',
      ])
    })

    it('rejects an object that never arrived, leaving the row pending', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const upload = await pendingUpload(author.id)
      await signInAs(author)
      vi.mocked(headObject).mockResolvedValue(null)
      await expect(attachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(ValidationError)
      expect((await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
        'pending',
      )
    })

    it.each([
      ['an oversized object', { size: 10 * 1024 * 1024 + 1, contentType: 'application/pdf' }],
      ['an empty object', { size: 0, contentType: 'application/pdf' }],
      ['a type the rule does not allow', { size: 10, contentType: 'text/html' }],
    ])('rejects %s, deleting the object', async (_name, head) => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const upload = await pendingUpload(author.id)
      await signInAs(author)
      vi.mocked(headObject).mockResolvedValue(head)
      await expect(attachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(ValidationError)
      expect(deleteObject).toHaveBeenCalledWith(upload.key)
      expect(await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        status: 'pending',
        postId: null,
      })
    })

    it(`allows ${POST_ATTACHMENTS_MAX} attachments and refuses the next`, async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      for (let n = 0; n < POST_ATTACHMENTS_MAX; n += 1) {
        await attachPostUpload(post.id, (await pendingUpload(author.id, `f${n}.pdf`)).id)
      }
      const extra = await pendingUpload(author.id, 'extra.pdf')
      const error = await attachPostUpload(post.id, extra.id).catch((caught) => caught)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toHaveProperty('uploadId')
      expect(await db.upload.findUniqueOrThrow({ where: { id: extra.id } })).toMatchObject({
        status: 'pending',
        postId: null,
      })
      expect((await getPost(post.id)).attachments).toHaveLength(POST_ATTACHMENTS_MAX)
    })

    it('cannot be raced past the maximum', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      await signInAs(author)
      for (let n = 0; n < POST_ATTACHMENTS_MAX - 1; n += 1) {
        await attachPostUpload(post.id, (await pendingUpload(author.id, `f${n}.pdf`)).id)
      }
      const [a, b, c] = [
        await pendingUpload(author.id, 'a.pdf'),
        await pendingUpload(author.id, 'b.pdf'),
        await pendingUpload(author.id, 'c.pdf'),
      ]
      const results = await Promise.allSettled(
        [a, b, c].map((upload) => attachPostUpload(post.id, upload.id)),
      )
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      expect(await db.upload.count({ where: { postId: post.id, status: 'attached' } })).toBe(
        POST_ATTACHMENTS_MAX,
      )
    })
  })

  describe('detachPostUpload', () => {
    const attached = async (authorId: string, postId: number, name = 'report.pdf') => {
      const upload = await pendingUpload(authorId, name)
      await db.upload.update({ where: { id: upload.id }, data: { status: 'attached', postId } })
      return upload
    }

    it('checks sign-in, then the post, then the permission, then the attachment', async () => {
      const author = await createUser({})
      const stranger = await createUser({})
      const post = await seedPost(author.id)
      const upload = await attached(author.id, post.id)

      signOut()
      await expect(detachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(stranger)
      await expect(detachPostUpload(999, upload.id)).rejects.toBeInstanceOf(NotFoundError)
      await expect(detachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(ForbiddenError)
      await signInAs(author)
      await expect(detachPostUpload(post.id, crypto.randomUUID())).rejects.toBeInstanceOf(
        NotFoundError,
      )
      expect(await db.upload.count({ where: { id: upload.id } })).toBe(1)
      expect(deleteJobs()).toHaveLength(0)
    })

    it('removes the row, queues the delayed object deletion and updates the post', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const upload = await attached(author.id, post.id)
      await signInAs(author)
      expect((await getPost(post.id)).attachments).toHaveLength(1)

      await detachPostUpload(post.id, upload.id)

      expect(await db.upload.count({ where: { id: upload.id } })).toBe(0)
      expect(deleteJobs()).toEqual([
        [
          'delete-object',
          { key: upload.key },
          { startAfter: objectDeleteDelaySeconds('attachment') },
        ],
      ])
      const detail = await getPost(post.id)
      expect(detail.attachments).toEqual([])
      expect(detail.version).toBe(1)
    })

    it('lets an admin remove an attachment someone else uploaded', async () => {
      const author = await createUser({})
      const admin = await createUser({ role: 'admin' })
      const post = await seedPost(author.id)
      const upload = await attached(author.id, post.id)
      await signInAs(admin)
      await detachPostUpload(post.id, upload.id)
      expect(await db.upload.count({ where: { id: upload.id } })).toBe(0)
    })

    it('does not remove an attachment of another post, a pending upload or an avatar', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id)
      const other = await seedPost(author.id)
      const elsewhere = await attached(author.id, other.id)
      const pending = await pendingUpload(author.id)
      const avatar = await pendingUpload(author.id, 'me.png', 'avatar')
      await signInAs(author)
      for (const upload of [elsewhere, pending, avatar]) {
        await expect(detachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(NotFoundError)
      }
      expect(await db.upload.count()).toBe(3)
      expect(deleteJobs()).toHaveLength(0)
    })

    it('answers 404 for a trashed post', async () => {
      const author = await createUser({})
      const post = await seedPost(author.id, { deletedAt: new Date() })
      const upload = await attached(author.id, post.id)
      await signInAs(author)
      await expect(detachPostUpload(post.id, upload.id)).rejects.toBeInstanceOf(NotFoundError)
      expect(await db.upload.count({ where: { id: upload.id } })).toBe(1)
    })
  })
})
