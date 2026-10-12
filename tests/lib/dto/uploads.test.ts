import { describe, expect, it } from 'vitest'
import {
  AVATAR_MAX_SIZE,
  createUploadInput,
  isAllowedContentType,
  MAX_OBJECT_DELETE_DELAY_SECONDS,
  objectDeleteDelaySeconds,
  UPLOAD_OBJECT_GRACE_SECONDS,
  UPLOAD_TICKET_SECONDS,
  uploadKeySchema,
  uploadTicketSchema,
} from '@/lib/dto/uploads'

const messages = (input: unknown) => {
  const result = createUploadInput.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

describe('UPLOAD_RULES', () => {
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

describe('upload ticket and key', () => {
  it('describes a presigned PUT: a URL and the headers the signature covers', () => {
    expect(
      uploadTicketSchema.parse({
        key: 'avatars/u/k',
        url: 'https://acct.r2.cloudflarestorage.com/b/k?X-Amz-Signature=s',
        headers: { 'Content-Type': 'image/png' },
      }).headers,
    ).toEqual({ 'Content-Type': 'image/png' })
    expect(uploadTicketSchema.safeParse({ key: 'k', url: 'x' }).success).toBe(false)
  })

  it('only accepts a key shaped like the ones createUpload makes', () => {
    const key = `avatars/${crypto.randomUUID()}/${crypto.randomUUID()}`
    expect(uploadKeySchema.safeParse(key).success).toBe(true)
    for (const bad of [
      'avatars/not-a-uuid/x',
      `avatars/${crypto.randomUUID()}`,
      `../avatars/${crypto.randomUUID()}/${crypto.randomUUID()}`,
      `Avatars/${crypto.randomUUID()}/${crypto.randomUUID()}`,
      '',
    ]) {
      expect(uploadKeySchema.safeParse(bad).success).toBe(false)
    }
  })
})
