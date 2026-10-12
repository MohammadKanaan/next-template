// @vitest-environment node
import { DeleteObjectCommand, HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerEnv } from '@/lib/server/env'
import {
  createUploadTicket,
  deleteObject,
  headObject,
  isStorageConfigured,
  keyFromPublicUrl,
  publicUrl,
} from '@/lib/server/storage'

const R2 = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  R2_PUBLIC_URL: 'https://pub-abc.r2.dev/',
}

const stubR2 = (values: Partial<Record<keyof typeof R2, string | undefined>> = R2) => {
  for (const name of Object.keys(R2) as (keyof typeof R2)[]) {
    vi.stubEnv(name, values[name])
  }
  resetServerEnv()
}

/** The client is a global singleton; a test that changes the env must drop it. */
const dropClient = () => {
  delete (globalThis as { r2?: unknown }).r2
}

describe('storage', () => {
  beforeEach(() => {
    stubR2()
    dropClient()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    resetServerEnv()
    dropClient()
  })

  it('is configured only when the R2 variables are set', () => {
    expect(isStorageConfigured()).toBe(true)
    stubR2({})
    expect(isStorageConfigured()).toBe(false)
    expect(() => publicUrl('avatars/u/1')).toThrow(/R2_/)
  })

  it('builds the public URL from the bucket origin, without a double slash', () => {
    expect(publicUrl('avatars/u/1')).toBe('https://pub-abc.r2.dev/avatars/u/1')
  })

  it('reads a key back from the public URL, for this bucket only', () => {
    expect(keyFromPublicUrl('https://pub-abc.r2.dev/avatars/u/1')).toBe('avatars/u/1')
    expect(keyFromPublicUrl(publicUrl('avatars/u/1'))).toBe('avatars/u/1')
    expect(keyFromPublicUrl('https://lh3.googleusercontent.com/a/picture')).toBeNull()
    expect(keyFromPublicUrl('https://pub-abc.r2.dev/')).toBeNull()
    expect(keyFromPublicUrl(null)).toBeNull()
    stubR2({})
    expect(keyFromPublicUrl('https://pub-abc.r2.dev/avatars/u/1')).toBeNull()
  })

  it('signs a PUT to the account endpoint whose signature covers the type and the exact size', async () => {
    const ticket = await createUploadTicket({
      key: 'avatars/u/1',
      contentType: 'image/png',
      size: 2048,
      expiresIn: 120,
    })
    const url = new URL(ticket.url)
    expect(url.origin).toBe('https://acct123.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/bucket/avatars/u/1')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(ticket.headers).toEqual({ 'Content-Type': 'image/png' })
  })

  it('signs a different URL for another size, so a file of the wrong size is refused', async () => {
    const small = await createUploadTicket({ key: 'k', contentType: 'image/png', size: 10 })
    const large = await createUploadTicket({ key: 'k', contentType: 'image/png', size: 11 })
    expect(new URL(small.url).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(large.url).searchParams.get('X-Amz-Signature'),
    )
  })

  it('heads an object into its size and content type', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ ContentLength: 321, ContentType: 'image/webp' } as never)
    expect(await headObject('avatars/u/1')).toEqual({ size: 321, contentType: 'image/webp' })
    const command = send.mock.calls[0][0] as HeadObjectCommand
    expect(command).toBeInstanceOf(HeadObjectCommand)
    expect(command.input).toEqual({ Bucket: 'bucket', Key: 'avatars/u/1' })
  })

  it('returns null for a missing object and rethrows other failures', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send')
    send.mockRejectedValueOnce(new NotFound({ message: 'nf', $metadata: {} }))
    expect(await headObject('missing')).toBeNull()
    send.mockRejectedValueOnce(new Error('boom'))
    await expect(headObject('broken')).rejects.toThrow('boom')
  })

  it('deletes an object from the configured bucket', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
    await deleteObject('avatars/u/1')
    const command = send.mock.calls[0][0] as DeleteObjectCommand
    expect(command).toBeInstanceOf(DeleteObjectCommand)
    expect(command.input).toEqual({ Bucket: 'bucket', Key: 'avatars/u/1' })
  })
})
