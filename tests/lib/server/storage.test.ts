// @vitest-environment node
import { HeadObjectCommand, NotFound, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploadTicket, deleteObject, headObject, publicUrl } from '@/lib/server/storage'

describe('storage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds the public URL from S3_PUBLIC_URL, which already includes the bucket', () => {
    expect(publicUrl('avatars/u/1')).toBe(`${process.env.S3_PUBLIC_URL}/avatars/u/1`)
  })

  it('signs a POST whose policy caps the size and pins the content type', async () => {
    const ticket = await createUploadTicket({
      key: 'avatars/u/1',
      contentType: 'image/png',
      maxSize: 2048,
    })
    expect(ticket.url).toContain(process.env.S3_BUCKET)
    expect(ticket.fields).toMatchObject({ key: 'avatars/u/1', 'Content-Type': 'image/png' })
    const policy = JSON.parse(Buffer.from(ticket.fields.Policy, 'base64').toString())
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 2048],
        ['eq', '$Content-Type', 'image/png'],
        { bucket: process.env.S3_BUCKET },
      ]),
    )
  })

  it('heads an object into its size and content type', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ ContentLength: 321, ContentType: 'image/webp' } as never)
    expect(await headObject('avatars/u/1')).toEqual({ size: 321, contentType: 'image/webp' })
    const command = send.mock.calls[0][0] as HeadObjectCommand
    expect(command).toBeInstanceOf(HeadObjectCommand)
    expect(command.input).toEqual({ Bucket: process.env.S3_BUCKET, Key: 'avatars/u/1' })
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
    expect(command.input).toEqual({ Bucket: process.env.S3_BUCKET, Key: 'avatars/u/1' })
  })
})
