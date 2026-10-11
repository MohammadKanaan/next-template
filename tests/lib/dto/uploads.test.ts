import { describe, expect, it } from 'vitest'
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_SIZE,
  createUploadInput,
  isAllowedContentType,
  MAX_OBJECT_DELETE_DELAY_SECONDS,
  objectDeleteDelaySeconds,
  UPLOAD_OBJECT_GRACE_SECONDS,
  UPLOAD_RULES,
  UPLOAD_TICKET_SECONDS,
  uploadIdSchema,
  uploadTicketSchema,
} from '@/lib/dto/uploads'

const messages = (input: unknown) => {
  const result = createUploadInput.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

describe('UPLOAD_RULES', () => {
  it('limits avatars to small raster images and three live tickets', () => {
    expect(UPLOAD_RULES.avatar).toMatchObject({
      contentTypes: AVATAR_CONTENT_TYPES,
      maxSize: 2 * 1024 * 1024,
      maxPending: 3,
      ticketSeconds: UPLOAD_TICKET_SECONDS,
    })
    expect(AVATAR_CONTENT_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp'])
  })

  it('never allows an active-content type', () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/javascript']) {
      expect(isAllowedContentType('avatar', type)).toBe(false)
    }
    expect(isAllowedContentType('avatar', null)).toBe(false)
    expect(isAllowedContentType('avatar', 'application/pdf')).toBe(false)
    expect(isAllowedContentType('avatar', 'image/webp')).toBe(true)
  })

  it('delays object deletion past the ticket plus the grace period', () => {
    expect(objectDeleteDelaySeconds('avatar')).toBe(
      UPLOAD_TICKET_SECONDS + UPLOAD_OBJECT_GRACE_SECONDS,
    )
    expect(MAX_OBJECT_DELETE_DELAY_SECONDS).toBe(objectDeleteDelaySeconds('avatar'))
  })
})

describe('createUploadInput', () => {
  it('accepts an avatar within its rule', () => {
    expect(
      messages({ purpose: 'avatar', contentType: 'image/webp', size: AVATAR_MAX_SIZE }),
    ).toEqual([])
  })

  it('refines the type and the size against the rule of the purpose', () => {
    expect(messages({ purpose: 'avatar', contentType: 'application/pdf', size: 10 })).toEqual([
      'contentType: Use a PNG, JPEG, or WebP image',
    ])
    expect(
      messages({ purpose: 'avatar', contentType: 'image/png', size: AVATAR_MAX_SIZE + 1 }),
    ).toEqual(['size: The image must be 2 MB or smaller'])
  })

  it('rejects an empty file, a fractional size and an unknown purpose', () => {
    expect(messages({ purpose: 'avatar', contentType: 'image/png', size: 0 })).toEqual([
      'size: The file is empty',
    ])
    expect(messages({ purpose: 'avatar', contentType: 'image/png', size: 1.5 })).toHaveLength(1)
    expect(messages({ purpose: 'banner', contentType: 'image/png', size: 1 })).toHaveLength(1)
  })
})

describe('upload ticket and id', () => {
  it('describes a presigned PUT: a URL and the headers the signature covers', () => {
    expect(
      uploadTicketSchema.parse({
        uploadId: 'u',
        url: 'https://acct.r2.cloudflarestorage.com/b/k?X-Amz-Signature=s',
        headers: { 'Content-Type': 'image/png' },
      }).headers,
    ).toEqual({ 'Content-Type': 'image/png' })
    expect(uploadTicketSchema.safeParse({ uploadId: 'u', url: 'x' }).success).toBe(false)
  })

  it('only accepts a UUID as an upload id', () => {
    expect(uploadIdSchema.safeParse(crypto.randomUUID()).success).toBe(true)
    expect(uploadIdSchema.safeParse('not-a-uuid').success).toBe(false)
  })
})
