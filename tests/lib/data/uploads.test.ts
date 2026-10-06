// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { attachAvatar, createAvatarUpload } from '@/lib/data/uploads'
import { getViewer } from '@/lib/data/users'
import { AVATAR_MAX_SIZE } from '@/lib/dto/uploads'
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

const input = { contentType: 'image/png', size: 1024 } as const

describe('uploads DAL', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(enqueue).mockClear()
    vi.mocked(createUploadTicket).mockClear()
    vi.mocked(deleteObject).mockClear()
    vi.mocked(headObject).mockResolvedValue({ size: 1024, contentType: 'image/png' })
  })
  afterAll(() => db.$disconnect())

  describe('createAvatarUpload', () => {
    it('requires a session', async () => {
      await expect(createAvatarUpload(input)).rejects.toBeInstanceOf(UnauthorizedError)
      expect(await db.upload.count()).toBe(0)
    })

    it('stores a pending upload under the viewer and returns a ticket', async () => {
      const user = await createUser({})
      await signInAs(user)
      const ticket = await createAvatarUpload(input)

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
      })
    })

    it('uses a different key every time', async () => {
      await signInAs(await createUser({}))
      const a = await createAvatarUpload(input)
      const b = await createAvatarUpload(input)
      const rows = await db.upload.findMany({ where: { id: { in: [a.uploadId, b.uploadId] } } })
      expect(new Set(rows.map((row) => row.key)).size).toBe(2)
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

      expect(deleteJobs()).toEqual([['delete-object', { key: first.key }]])
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
    ])('rejects %s, deleting the object and the row', async (_name, head) => {
      const user = await createUser({})
      await signInAs(user)
      const upload = await pendingUpload(user.id)
      vi.mocked(headObject).mockResolvedValue(head)

      const error = await attachAvatar(upload.id).catch((caught) => caught)

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toHaveProperty('uploadId')
      expect(deleteObject).toHaveBeenCalledWith(upload.key)
      expect(await db.upload.count({ where: { id: upload.id } })).toBe(0)
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
