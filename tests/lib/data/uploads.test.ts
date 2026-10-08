// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { attachAvatar, createUpload } from '@/lib/data/uploads'
import { getViewer } from '@/lib/data/users'
import {
  ATTACHMENT_MAX_SIZE,
  AVATAR_MAX_SIZE,
  objectDeleteDelaySeconds,
  UPLOAD_OBJECT_GRACE_SECONDS,
  UPLOAD_RULES,
  UPLOAD_TICKET_SECONDS,
} from '@/lib/dto/uploads'
import { enqueue } from '@/lib/server/queue'
import { createUploadTicket, deleteObject, headObject } from '@/lib/server/storage'
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
  createUploadTicket: vi.fn(async () => ({
    url: 'http://storage.test/bucket',
    fields: { key: 'k', 'Content-Type': 'image/png' },
  })),
  headObject: vi.fn(async () => ({ size: 1024, contentType: 'image/png' })),
  deleteObject: vi.fn(async () => {}),
  publicUrl: (key: string) => `http://storage.test/bucket/${key}`,
}))

/** Sign-up also queues an email; only the object-deletion jobs matter here. */
const deleteJobs = () => vi.mocked(enqueue).mock.calls.filter(([name]) => name === 'delete-object')

const input = { purpose: 'avatar', contentType: 'image/png', size: 1024 } as const

describe('uploads DAL', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(enqueue).mockClear()
    vi.mocked(createUploadTicket).mockClear()
    vi.mocked(deleteObject).mockClear()
    vi.mocked(headObject).mockResolvedValue({ size: 1024, contentType: 'image/png' })
  })
  afterAll(() => db.$disconnect())

  describe('createUpload (avatar)', () => {
    it('requires a session', async () => {
      await expect(createUpload(input)).rejects.toBeInstanceOf(UnauthorizedError)
      expect(await db.upload.count()).toBe(0)
    })

    it('stores a pending upload under the viewer and returns a ticket', async () => {
      const user = await createUser({})
      await signInAs(user)
      const ticket = await createUpload(input)

      const row = await db.upload.findUniqueOrThrow({ where: { id: ticket.uploadId } })
      expect(row).toMatchObject({
        userId: user.id,
        purpose: 'avatar',
        contentType: 'image/png',
        size: 1024,
        status: 'pending',
      })
      expect(row.key).toMatch(new RegExp(`^avatars/${user.id}/[0-9a-f-]{36}$`))
      expect(ticket).toMatchObject({ url: 'http://storage.test/bucket' })
      expect(createUploadTicket).toHaveBeenCalledWith({
        key: row.key,
        contentType: 'image/png',
        maxSize: AVATAR_MAX_SIZE,
        expiresIn: UPLOAD_TICKET_SECONDS,
      })
    })

    it('uses a different key every time', async () => {
      await signInAs(await createUser({}))
      const a = await createUpload(input)
      const b = await createUpload(input)
      const rows = await db.upload.findMany({ where: { id: { in: [a.uploadId, b.uploadId] } } })
      expect(new Set(rows.map((row) => row.key)).size).toBe(2)
    })

    it('refuses a fourth ticket while three are still live', async () => {
      const user = await createUser({})
      await signInAs(user)
      for (let i = 0; i < 3; i += 1) {
        await createUpload(input)
      }

      await expect(createUpload(input)).rejects.toBeInstanceOf(RateLimitedError)

      expect(await db.upload.count({ where: { userId: user.id } })).toBe(3)
      expect(deleteObject).not.toHaveBeenCalled()
    })

    it('neither counts nor reclaims rows whose ticket expired inside the grace period', async () => {
      const user = await createUser({})
      await signInAs(user)
      for (let i = 0; i < 3; i += 1) {
        await createUpload(input)
      }
      // The ticket is dead but a slow upload that started just before expiry may still land.
      await db.upload.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - (UPLOAD_TICKET_SECONDS + 1) * 1000) },
      })

      await createUpload(input)

      expect(deleteObject).not.toHaveBeenCalled()
      expect(await db.upload.count({ where: { userId: user.id } })).toBe(4)
    })

    it('reclaims rows once the ticket and the grace period have passed', async () => {
      const user = await createUser({})
      await signInAs(user)
      const keys: string[] = []
      for (let i = 0; i < 3; i += 1) {
        const ticket = await createUpload(input)
        keys.push((await db.upload.findUniqueOrThrow({ where: { id: ticket.uploadId } })).key)
      }
      const age = (UPLOAD_TICKET_SECONDS + UPLOAD_OBJECT_GRACE_SECONDS + 1) * 1000
      await db.upload.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - age) },
      })

      const ticket = await createUpload(input)

      expect(deleteObject).toHaveBeenCalledTimes(3)
      expect(
        vi
          .mocked(deleteObject)
          .mock.calls.map(([key]) => key)
          .sort(),
      ).toEqual(keys.sort())
      const rows = await db.upload.findMany({ where: { userId: user.id } })
      expect(rows.map((row) => row.id)).toEqual([ticket.uploadId])
    })

    it("leaves another user's pending uploads alone", async () => {
      const a = await createUser({})
      const b = await createUser({})
      await signInAs(a)
      await createUpload(input)
      await createUpload(input)
      await createUpload(input)
      // A's cap is full, but B's first ticket is not affected by it.
      await signInAs(b)
      await createUpload(input)

      expect(await db.upload.count({ where: { userId: b.id } })).toBe(1)
      expect(await db.upload.count({ where: { userId: a.id } })).toBe(3)
      expect(deleteObject).not.toHaveBeenCalled()
    })
  })

  describe('createUpload (rules per purpose)', () => {
    const base = {
      purpose: 'attachment',
      contentType: 'application/pdf',
      size: 5000,
      name: 'report.pdf',
    } as const
    // The ticket is for a post the viewer may update: here one of their own, created by `ownPost`.
    let attachment: typeof base & { postId: number }
    const ownPost = async (userId: string) => {
      const post = await db.post.create({ data: { userId, title: 'T', body: 'B' } })
      attachment = { ...base, postId: post.id }
      return post
    }

    it('keeps the table in sync with the numbers the plan names', () => {
      expect(UPLOAD_RULES.avatar).toMatchObject({ maxSize: AVATAR_MAX_SIZE, maxPending: 3 })
      expect(UPLOAD_RULES.attachment).toMatchObject({ maxSize: ATTACHMENT_MAX_SIZE, maxPending: 5 })
      expect(ATTACHMENT_MAX_SIZE).toBe(10 * 1024 * 1024)
    })

    it('stores an attachment under attachments/<user>/ with its name and the attachment limits', async () => {
      const user = await createUser({})
      await ownPost(user.id)
      await signInAs(user)
      const ticket = await createUpload(attachment)

      const row = await db.upload.findUniqueOrThrow({ where: { id: ticket.uploadId } })
      expect(row).toMatchObject({
        userId: user.id,
        purpose: 'attachment',
        contentType: 'application/pdf',
        size: 5000,
        name: 'report.pdf',
        postId: null,
        status: 'pending',
      })
      expect(row.key).toMatch(new RegExp(`^attachments/${user.id}/[0-9a-f-]{36}$`))
      expect(createUploadTicket).toHaveBeenCalledWith({
        key: row.key,
        contentType: 'application/pdf',
        maxSize: ATTACHMENT_MAX_SIZE,
        expiresIn: UPLOAD_TICKET_SECONDS,
      })
    })

    it('does not keep a name for an avatar', async () => {
      await signInAs(await createUser({}))
      const ticket = await createUpload({ ...input, name: 'me.png' })
      expect(
        (await db.upload.findUniqueOrThrow({ where: { id: ticket.uploadId } })).name,
      ).toBeNull()
    })

    it.each([
      ['an avatar that is not an image it knows', { ...input, contentType: 'application/pdf' }],
      ['an avatar over 2 MB', { ...input, size: AVATAR_MAX_SIZE + 1 }],
      ['an attachment of an unknown type', { ...base, postId: 1, contentType: 'text/html' }],
      ['an svg attachment', { ...base, postId: 1, contentType: 'image/svg+xml' }],
      ['an attachment over 10 MB', { ...base, postId: 1, size: ATTACHMENT_MAX_SIZE + 1 }],
      ['an attachment without a name', { ...base, postId: 1, name: undefined }],
      ['an attachment without a post', base],
      ['an attachment for a malformed post id', { ...base, postId: 0 }],
      ['an empty file', { ...base, postId: 1, size: 0 }],
      ['an unknown purpose', { ...base, postId: 1, purpose: 'banner' }],
    ])('rejects %s', async (_name, bad) => {
      await signInAs(await createUser({}))
      await expect(createUpload(bad as never)).rejects.toBeInstanceOf(ValidationError)
      expect(await db.upload.count()).toBe(0)
    })

    it('accepts every attachment type the rule lists', async () => {
      const user = await createUser({})
      await ownPost(user.id)
      await signInAs(user)
      for (const contentType of UPLOAD_RULES.attachment.contentTypes) {
        await db.upload.deleteMany()
        await expect(createUpload({ ...attachment, contentType })).resolves.toBeDefined()
      }
      expect(UPLOAD_RULES.attachment.contentTypes).toContain('text/csv')
    })

    it('allows five pending attachments, a sixth is refused, and avatars count apart', async () => {
      const user = await createUser({})
      await ownPost(user.id)
      await signInAs(user)
      for (let i = 0; i < 5; i += 1) {
        await createUpload(attachment)
      }
      await expect(createUpload(attachment)).rejects.toBeInstanceOf(RateLimitedError)
      // Three avatar tickets are their own budget.
      for (let i = 0; i < 3; i += 1) {
        await createUpload(input)
      }
      await expect(createUpload(input)).rejects.toBeInstanceOf(RateLimitedError)
      expect(await db.upload.count({ where: { userId: user.id } })).toBe(8)
    })

    describe('the post an attachment ticket is for', () => {
      it('requires a session before anything else', async () => {
        await expect(createUpload({ ...base, postId: 1 })).rejects.toBeInstanceOf(UnauthorizedError)
      })

      it('answers 404 for a missing post and for a post in the trash', async () => {
        const author = await createUser({})
        const post = await ownPost(author.id)
        await signInAs(author)
        await expect(createUpload({ ...base, postId: post.id + 1000 })).rejects.toBeInstanceOf(
          NotFoundError,
        )
        await db.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } })
        await expect(createUpload(attachment)).rejects.toBeInstanceOf(NotFoundError)
        expect(await db.upload.count()).toBe(0)
      })

      it('answers 403 for someone who may not update the post, and issues nothing', async () => {
        const author = await createUser({})
        const post = await ownPost(author.id)
        await signInAs(await createUser({}))
        await expect(createUpload(attachment)).rejects.toBeInstanceOf(ForbiddenError)
        expect(await db.upload.count()).toBe(0)
        expect(createUploadTicket).not.toHaveBeenCalled()
        expect(post.id).toBe(attachment.postId)
      })

      it("lets an admin ask for a ticket for someone else's post", async () => {
        const author = await createUser({})
        await ownPost(author.id)
        await signInAs(await createUser({ role: 'admin' }))
        await expect(createUpload(attachment)).resolves.toBeDefined()
      })

      it('leaves avatar tickets alone: they name no post', async () => {
        await signInAs(await createUser({}))
        await expect(createUpload({ ...input, postId: 999 })).resolves.toBeDefined()
      })
    })

    it('reclaims only stale rows of the same purpose', async () => {
      const user = await createUser({})
      await ownPost(user.id)
      await signInAs(user)
      const avatarTicket = await createUpload(input)
      const attachmentTicket = await createUpload(attachment)
      const age = (UPLOAD_TICKET_SECONDS + UPLOAD_OBJECT_GRACE_SECONDS + 1) * 1000
      await db.upload.updateMany({
        where: { userId: user.id },
        data: { createdAt: new Date(Date.now() - age) },
      })

      await createUpload(attachment)

      const rows = await db.upload.findMany({ where: { userId: user.id } })
      expect(rows.map((row) => row.id)).toContain(avatarTicket.uploadId)
      expect(rows.map((row) => row.id)).not.toContain(attachmentTicket.uploadId)
      expect(deleteObject).toHaveBeenCalledTimes(1)
    })
  })

  describe('attachAvatar', () => {
    const pendingUpload = async (userId: string) => {
      return db.upload.create({
        data: {
          key: `avatars/${userId}/${crypto.randomUUID()}`,
          userId,
          purpose: 'avatar',
          contentType: 'image/png',
          size: 1024,
        },
      })
    }

    it('checks sign-in, then existence, then ownership', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const upload = await pendingUpload(owner.id)

      signOut()
      await expect(attachAvatar(upload.id)).rejects.toBeInstanceOf(UnauthorizedError)
      // Even a missing id is a 401 before it is a 404.
      await expect(attachAvatar(crypto.randomUUID())).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(other)
      await expect(attachAvatar(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError)
      await expect(attachAvatar(upload.id)).rejects.toBeInstanceOf(ForbiddenError)
      // Not even an admin may use someone else's upload.
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(attachAvatar(upload.id)).rejects.toBeInstanceOf(ForbiddenError)

      expect(headObject).not.toHaveBeenCalled()
      expect((await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
        'pending',
      )
    })

    it('sets the user image to the public URL and marks the upload attached', async () => {
      const user = await createUser({})
      await signInAs(user)
      const upload = await pendingUpload(user.id)

      const result = await attachAvatar(upload.id)

      expect(result.image).toBe(`http://storage.test/bucket/${upload.key}`)
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).image).toBe(result.image)
      expect(await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        status: 'attached',
        size: 1024,
      })
      expect(deleteJobs()).toHaveLength(0)
    })

    it('refreshes the cached viewer', async () => {
      const user = await createUser({})
      await signInAs(user)
      expect((await getViewer())?.image).toBeNull()
      const upload = await pendingUpload(user.id)

      await attachAvatar(upload.id)

      expect((await getViewer())?.image).toBe(`http://storage.test/bucket/${upload.key}`)
    })

    it('queues the replaced avatar object for deletion and drops its row', async () => {
      const user = await createUser({})
      await signInAs(user)
      const first = await pendingUpload(user.id)
      await attachAvatar(first.id)
      const second = await pendingUpload(user.id)

      await attachAvatar(second.id)

      expect(deleteJobs()).toEqual([
        ['delete-object', { key: first.key }, { startAfter: objectDeleteDelaySeconds('avatar') }],
      ])
      const rows = await db.upload.findMany({ where: { userId: user.id } })
      expect(rows.map((row) => row.id)).toEqual([second.id])
    })

    it('does not touch another user avatar when replacing', async () => {
      const user = await createUser({})
      const other = await createUser({})
      const othersUpload = await pendingUpload(other.id)
      await db.upload.update({ where: { id: othersUpload.id }, data: { status: 'attached' } })
      await signInAs(user)
      await attachAvatar((await pendingUpload(user.id)).id)
      expect(deleteJobs()).toHaveLength(0)
      expect(await db.upload.count({ where: { id: othersUpload.id } })).toBe(1)
    })

    it('rejects an upload that never reached storage', async () => {
      const user = await createUser({})
      await signInAs(user)
      const upload = await pendingUpload(user.id)
      vi.mocked(headObject).mockResolvedValue(null)

      await expect(attachAvatar(upload.id)).rejects.toBeInstanceOf(ValidationError)

      expect((await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
        'pending',
      )
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).image).toBeNull()
    })

    it.each([
      ['an oversized object', { size: AVATAR_MAX_SIZE + 1, contentType: 'image/png' }],
      ['an empty object', { size: 0, contentType: 'image/png' }],
      ['a wrong content type', { size: 1024, contentType: 'text/html' }],
      ['a missing content type', { size: 1024, contentType: null }],
    ])('rejects %s, deleting the object and leaving the row pending', async (_name, head) => {
      const user = await createUser({})
      await signInAs(user)
      const upload = await pendingUpload(user.id)
      vi.mocked(headObject).mockResolvedValue(head)

      const error = await attachAvatar(upload.id).catch((caught) => caught)

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toHaveProperty('uploadId')
      expect(deleteObject).toHaveBeenCalledWith(upload.key)
      expect(await db.upload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
        status: 'pending',
      })
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).image).toBeNull()
    })

    it('refuses to attach the same upload twice', async () => {
      const user = await createUser({})
      await signInAs(user)
      const upload = await pendingUpload(user.id)
      await attachAvatar(upload.id)
      await expect(attachAvatar(upload.id)).rejects.toBeInstanceOf(ValidationError)
    })

    it('lets only one of two concurrent attaches of the same upload win', async () => {
      const user = await createUser({})
      await signInAs(user)
      const upload = await pendingUpload(user.id)
      const results = await Promise.allSettled([attachAvatar(upload.id), attachAvatar(upload.id)])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const failed = results.find((result) => result.status === 'rejected')
      expect(failed?.reason).toBeInstanceOf(ValidationError)
      expect(await db.upload.count({ where: { status: 'attached' } })).toBe(1)
    })

    it('keeps one attached avatar when two different uploads attach concurrently', async () => {
      const user = await createUser({})
      await signInAs(user)
      const first = await pendingUpload(user.id)
      const second = await pendingUpload(user.id)
      await Promise.all([attachAvatar(first.id), attachAvatar(second.id)])
      const attached = await db.upload.findMany({ where: { status: 'attached' } })
      expect(attached).toHaveLength(1)
      const { image } = await db.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(image).toBe(`http://storage.test/bucket/${attached[0].key}`)
    })
  })
})
