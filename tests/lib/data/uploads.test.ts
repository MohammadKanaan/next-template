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
  AVATAR_MAX_SIZE,
  objectDeleteDelaySeconds,
  UPLOAD_OBJECT_GRACE_SECONDS,
  UPLOAD_RULES,
  UPLOAD_TICKET_SECONDS,
} from '@/lib/dto/uploads'
import { enqueue } from '@/lib/server/queue'
import {
  createUploadTicket,
  deleteObject,
  headObject,
  isStorageConfigured,
} from '@/lib/server/storage'
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
  isStorageConfigured: vi.fn(() => true),
  createUploadTicket: vi.fn(async () => ({
    url: 'https://acct.r2.cloudflarestorage.com/bucket/k?X-Amz-Signature=s',
    headers: { 'Content-Type': 'image/png' },
  })),
  headObject: vi.fn(async () => ({ size: 1024, contentType: 'image/png' })),
  deleteObject: vi.fn(async () => {}),
  publicUrl: (key: string) => `https://pub-abc.r2.dev/${key}`,
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
    vi.mocked(isStorageConfigured).mockReturnValue(true)
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
      expect(ticket).toMatchObject({
        url: 'https://acct.r2.cloudflarestorage.com/bucket/k?X-Amz-Signature=s',
        headers: { 'Content-Type': 'image/png' },
      })
      // Signed for the exact size the browser declared, so another size is refused by storage.
      expect(createUploadTicket).toHaveBeenCalledWith({
        key: row.key,
        contentType: 'image/png',
        size: 1024,
        expiresIn: UPLOAD_TICKET_SECONDS,
      })
    })

    it('refuses a ticket while storage is not configured, after the session and input checks', async () => {
      vi.mocked(isStorageConfigured).mockReturnValue(false)
      await expect(createUpload(input)).rejects.toBeInstanceOf(UnauthorizedError)
      await signInAs(await createUser({}))
      await expect(createUpload({ ...input, size: 0 })).rejects.toMatchObject({
        fieldErrors: { size: ['The file is empty'] },
      })
      await expect(createUpload(input)).rejects.toMatchObject({
        fieldErrors: { base: ['Uploads are not available'] },
      })
      expect(await db.upload.count()).toBe(0)
      expect(createUploadTicket).not.toHaveBeenCalled()
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

  describe('createUpload (rules)', () => {
    it('keeps the table in sync with the numbers the UI shows', () => {
      expect(UPLOAD_RULES.avatar).toMatchObject({ maxSize: AVATAR_MAX_SIZE, maxPending: 3 })
    })

    it.each([
      ['an avatar that is not an image it knows', { ...input, contentType: 'application/pdf' }],
      ['an svg', { ...input, contentType: 'image/svg+xml' }],
      ['an avatar over 2 MB', { ...input, size: AVATAR_MAX_SIZE + 1 }],
      ['an empty file', { ...input, size: 0 }],
      ['an unknown purpose', { ...input, purpose: 'banner' }],
    ])('rejects %s', async (_name, bad) => {
      await signInAs(await createUser({}))
      await expect(createUpload(bad as never)).rejects.toBeInstanceOf(ValidationError)
      expect(await db.upload.count()).toBe(0)
    })

    it('accepts every avatar type the rule lists', async () => {
      await signInAs(await createUser({}))
      for (const contentType of UPLOAD_RULES.avatar.contentTypes) {
        await db.upload.deleteMany()
        await expect(createUpload({ ...input, contentType })).resolves.toBeDefined()
      }
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

      expect(result.image).toBe(`https://pub-abc.r2.dev/${upload.key}`)
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

      expect((await getViewer())?.image).toBe(`https://pub-abc.r2.dev/${upload.key}`)
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
      expect(image).toBe(`https://pub-abc.r2.dev/${attached[0].key}`)
    })
  })
})
