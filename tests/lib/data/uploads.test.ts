// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/data/db'
import {
  ForbiddenError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'
import { attachAvatar, createUpload } from '@/lib/data/uploads'
import { getViewer } from '@/lib/data/users'
import {
  AVATAR_MAX_SIZE,
  objectDeleteDelaySeconds,
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
const BUCKET_URL = vi.hoisted(() => 'https://pub-abc.r2.dev/')
vi.mock('@/lib/server/storage', () => ({
  isStorageConfigured: vi.fn(() => true),
  createUploadTicket: vi.fn(async () => ({
    url: 'https://acct.r2.cloudflarestorage.com/bucket/k?X-Amz-Signature=s',
    headers: { 'Content-Type': 'image/png' },
  })),
  headObject: vi.fn(async () => ({ size: 1024, contentType: 'image/png' })),
  deleteObject: vi.fn(async () => {}),
  publicUrl: (key: string) => `${BUCKET_URL}${key}`,
  keyFromPublicUrl: (url: string | null) =>
    url?.startsWith(BUCKET_URL) ? url.slice(BUCKET_URL.length) : null,
}))

/** Sign-up also queues an email; only the object-deletion jobs matter here. */
const deleteJobs = () => vi.mocked(enqueue).mock.calls.filter(([name]) => name === 'delete-object')

const input = { purpose: 'avatar', contentType: 'image/png', size: 1024 } as const

/** A key as `createUpload` would hand it out to `userId`. */
const avatarKey = (userId: string) => `avatars/${userId}/${crypto.randomUUID()}`

describe('uploads DAL', () => {
  beforeEach(async () => {
    await resetDatabase()
    vi.mocked(enqueue).mockClear()
    vi.mocked(createUploadTicket).mockClear()
    vi.mocked(deleteObject).mockClear()
    vi.mocked(headObject).mockClear()
    vi.mocked(headObject).mockResolvedValue({ size: 1024, contentType: 'image/png' })
    vi.mocked(isStorageConfigured).mockReturnValue(true)
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(() => db.$disconnect())

  describe('createUpload (avatar)', () => {
    it("returns a ticket for a new key under the viewer's own prefix", async () => {
      const user = await createUser({})
      await signInAs(user)
      const ticket = await createUpload(input)

      expect(ticket.key).toMatch(new RegExp(`^avatars/${user.id}/[0-9a-f-]{36}$`))
      expect(ticket).toMatchObject({
        url: 'https://acct.r2.cloudflarestorage.com/bucket/k?X-Amz-Signature=s',
        headers: { 'Content-Type': 'image/png' },
      })
      // Signed for the exact size the browser declared, so another size is refused by storage.
      expect(createUploadTicket).toHaveBeenCalledWith({
        key: ticket.key,
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
      expect(createUploadTicket).not.toHaveBeenCalled()
    })

    it('uses a different key every time', async () => {
      await signInAs(await createUser({}))
      const a = await createUpload(input)
      const b = await createUpload(input)
      expect(a.key).not.toBe(b.key)
    })

    it('limits tickets per user in production, without affecting other users', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const a = await createUser({})
      const b = await createUser({})
      await signInAs(a)
      for (let i = 0; i < 10; i += 1) {
        await createUpload(input)
      }

      await expect(createUpload(input)).rejects.toBeInstanceOf(RateLimitedError)

      await signInAs(b)
      await expect(createUpload(input)).resolves.toBeDefined()
      expect(createUploadTicket).toHaveBeenCalledTimes(11)
    })
  })

  describe('createUpload (admin-only purposes)', () => {
    afterEach(() => {
      UPLOAD_RULES.avatar.adminOnly = false
    })

    it('hands a ticket to an admin only, after the session and input checks', async () => {
      UPLOAD_RULES.avatar.adminOnly = true
      await expect(createUpload(input)).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(await createUser({}))
      await expect(createUpload({ ...input, size: 0 })).rejects.toBeInstanceOf(ValidationError)
      await expect(createUpload(input)).rejects.toBeInstanceOf(ForbiddenError)
      expect(createUploadTicket).not.toHaveBeenCalled()

      await signInAs(await createUser({ role: 'admin' }))
      await expect(createUpload(input)).resolves.toBeDefined()
    })
  })

  describe('createUpload (rules)', () => {
    it.each([
      ['an avatar that is not an image it knows', { ...input, contentType: 'application/pdf' }],
      ['an svg', { ...input, contentType: 'image/svg+xml' }],
      ['an avatar over 2 MB', { ...input, size: AVATAR_MAX_SIZE + 1 }],
      ['an empty file', { ...input, size: 0 }],
      ['an unknown purpose', { ...input, purpose: 'banner' }],
    ])('rejects %s', async (_name, bad) => {
      await signInAs(await createUser({}))
      await expect(createUpload(bad as never)).rejects.toBeInstanceOf(ValidationError)
      expect(createUploadTicket).not.toHaveBeenCalled()
    })

    it('accepts every avatar type the rule lists', async () => {
      await signInAs(await createUser({}))
      for (const contentType of UPLOAD_RULES.avatar.contentTypes) {
        await expect(createUpload({ ...input, contentType })).resolves.toBeDefined()
      }
    })
  })

  describe('attachAvatar', () => {
    const imageOf = async (userId: string) =>
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).image

    it('checks sign-in, then the key, then ownership', async () => {
      const owner = await createUser({})
      const other = await createUser({})
      const key = avatarKey(owner.id)

      signOut()
      // Even a malformed key is a 401 before it is a 422.
      await expect(attachAvatar('nope')).rejects.toBeInstanceOf(UnauthorizedError)

      await signInAs(other)
      await expect(attachAvatar('nope')).rejects.toBeInstanceOf(ValidationError)
      await expect(attachAvatar(`../${key}`)).rejects.toBeInstanceOf(ValidationError)
      await expect(attachAvatar(key)).rejects.toBeInstanceOf(ForbiddenError)
      // A key of another purpose under the viewer's own id is not an avatar.
      await expect(
        attachAvatar(`banners/${other.id}/${crypto.randomUUID()}`),
      ).rejects.toBeInstanceOf(ForbiddenError)
      // Not even an admin may attach someone else's object.
      const admin = await createUser({ role: 'admin' })
      await signInAs(admin)
      await expect(attachAvatar(key)).rejects.toBeInstanceOf(ForbiddenError)

      expect(headObject).not.toHaveBeenCalled()
      expect(await imageOf(owner.id)).toBeNull()
    })

    it('sets the user image to the public URL', async () => {
      const user = await createUser({})
      await signInAs(user)
      const key = avatarKey(user.id)

      const result = await attachAvatar(key)

      expect(result.image).toBe(`${BUCKET_URL}${key}`)
      expect(await imageOf(user.id)).toBe(result.image)
      expect(headObject).toHaveBeenCalledWith(key)
      expect(deleteJobs()).toHaveLength(0)
    })

    it('refreshes the cached viewer', async () => {
      const user = await createUser({})
      await signInAs(user)
      expect((await getViewer())?.image).toBeNull()
      const key = avatarKey(user.id)

      await attachAvatar(key)

      expect((await getViewer())?.image).toBe(`${BUCKET_URL}${key}`)
    })

    it('queues the replaced avatar object for deletion', async () => {
      const user = await createUser({})
      await signInAs(user)
      const first = avatarKey(user.id)
      await attachAvatar(first)

      await attachAvatar(avatarKey(user.id))

      expect(deleteJobs()).toEqual([
        ['delete-object', { key: first }, { startAfter: objectDeleteDelaySeconds('avatar') }],
      ])
    })

    it('deletes nothing when the current avatar is attached again', async () => {
      const user = await createUser({})
      await signInAs(user)
      const key = avatarKey(user.id)
      await attachAvatar(key)

      await attachAvatar(key)

      expect(deleteJobs()).toHaveLength(0)
      expect(await imageOf(user.id)).toBe(`${BUCKET_URL}${key}`)
    })

    it('replaces a picture that is not in the bucket without deleting anything', async () => {
      const user = await createUser({})
      await db.user.update({
        where: { id: user.id },
        data: { image: 'https://lh3.googleusercontent.com/a/picture' },
      })
      await signInAs(user)

      await attachAvatar(avatarKey(user.id))

      expect(deleteJobs()).toHaveLength(0)
    })

    it('rejects an upload that never reached storage', async () => {
      const user = await createUser({})
      await signInAs(user)
      vi.mocked(headObject).mockResolvedValue(null)

      await expect(attachAvatar(avatarKey(user.id))).rejects.toBeInstanceOf(ValidationError)

      expect(deleteObject).not.toHaveBeenCalled()
      expect(await imageOf(user.id)).toBeNull()
    })

    it.each([
      ['an oversized object', { size: AVATAR_MAX_SIZE + 1, contentType: 'image/png' }],
      ['an empty object', { size: 0, contentType: 'image/png' }],
      ['a wrong content type', { size: 1024, contentType: 'text/html' }],
      ['a missing content type', { size: 1024, contentType: null }],
    ])('rejects %s and deletes the object', async (_name, head) => {
      const user = await createUser({})
      await signInAs(user)
      const key = avatarKey(user.id)
      vi.mocked(headObject).mockResolvedValue(head)

      const error = await attachAvatar(key).catch((caught) => caught)

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.fieldErrors).toHaveProperty('key')
      expect(deleteObject).toHaveBeenCalledWith(key)
      expect(await imageOf(user.id)).toBeNull()
    })

    it('loses track of no object when two different avatars attach concurrently', async () => {
      const user = await createUser({})
      await signInAs(user)
      const first = avatarKey(user.id)
      const second = avatarKey(user.id)

      await Promise.all([attachAvatar(first), attachAvatar(second)])

      // The row lock orders them: the later attach sees and replaces the earlier avatar.
      const image = await imageOf(user.id)
      const kept = image?.slice(BUCKET_URL.length)
      expect([first, second]).toContain(kept)
      const replaced = kept === first ? second : first
      expect(deleteJobs().map(([, payload]) => payload)).toEqual([{ key: replaced }])
    })
  })
})
