import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_CONTENT_TYPES,
  ATTACHMENT_MAX_SIZE,
  AVATAR_MAX_SIZE,
  createUploadInput,
  isAllowedContentType,
  MAX_OBJECT_DELETE_DELAY_SECONDS,
  objectDeleteDelaySeconds,
  POST_ATTACHMENTS_MAX,
  UPLOAD_OBJECT_GRACE_SECONDS,
  UPLOAD_RULES,
  UPLOAD_TICKET_SECONDS,
} from '@/lib/dto/uploads'

const messages = (input: unknown) => {
  const result = createUploadInput.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

describe('UPLOAD_RULES', () => {
  it('has the avatar limits as before and the attachment limits of the plan', () => {
    expect(UPLOAD_RULES.avatar).toMatchObject({
      contentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maxSize: 2 * 1024 * 1024,
      maxPending: 3,
      ticketSeconds: 300,
    })
    expect(UPLOAD_RULES.attachment).toMatchObject({
      maxSize: 10 * 1024 * 1024,
      maxPending: 5,
      ticketSeconds: 300,
    })
    expect(UPLOAD_RULES.attachment.contentTypes).toEqual(ATTACHMENT_CONTENT_TYPES)
    expect(ATTACHMENT_CONTENT_TYPES).toEqual(
      expect.arrayContaining(['image/png', 'application/pdf', 'text/csv']),
    )
    expect(POST_ATTACHMENTS_MAX).toBe(10)
  })

  it('never allows an active-content type', () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/javascript']) {
      expect(isAllowedContentType('attachment', type)).toBe(false)
      expect(isAllowedContentType('avatar', type)).toBe(false)
    }
    expect(isAllowedContentType('avatar', null)).toBe(false)
    expect(isAllowedContentType('avatar', 'application/pdf')).toBe(false)
    expect(isAllowedContentType('attachment', 'application/pdf')).toBe(true)
  })

  it('delays object deletion past the ticket plus the grace period', () => {
    expect(objectDeleteDelaySeconds('avatar')).toBe(
      UPLOAD_TICKET_SECONDS + UPLOAD_OBJECT_GRACE_SECONDS,
    )
    expect(MAX_OBJECT_DELETE_DELAY_SECONDS).toBeGreaterThanOrEqual(
      objectDeleteDelaySeconds('attachment'),
    )
  })
})

describe('createUploadInput', () => {
  it('accepts an avatar and an attachment within their rules', () => {
    expect(
      messages({ purpose: 'avatar', contentType: 'image/webp', size: AVATAR_MAX_SIZE }),
    ).toEqual([])
    expect(
      messages({
        purpose: 'attachment',
        contentType: 'text/csv',
        size: ATTACHMENT_MAX_SIZE,
        name: 'data.csv',
        postId: 1,
      }),
    ).toEqual([])
  })

  it('refines against the rule of the purpose', () => {
    expect(messages({ purpose: 'avatar', contentType: 'application/pdf', size: 10 })).toEqual([
      'contentType: Use a PNG, JPEG, or WebP image',
    ])
    expect(
      messages({ purpose: 'avatar', contentType: 'image/png', size: AVATAR_MAX_SIZE + 1 }),
    ).toEqual(['size: The image must be 2 MB or smaller'])
    expect(
      messages({
        purpose: 'attachment',
        contentType: 'image/png',
        size: AVATAR_MAX_SIZE + 1,
        name: 'a.png',
        postId: 1,
      }),
    ).toEqual([])
    expect(
      messages({
        purpose: 'attachment',
        contentType: 'text/html',
        size: 1,
        name: 'a.html',
        postId: 1,
      }),
    ).toHaveLength(1)
    expect(
      messages({
        purpose: 'attachment',
        contentType: 'application/pdf',
        size: ATTACHMENT_MAX_SIZE + 1,
        name: 'a.pdf',
        postId: 1,
      }),
    ).toEqual(['size: The file must be 10 MB or smaller'])
  })

  it('needs a name for an attachment only, trimmed and bounded', () => {
    expect(
      messages({ purpose: 'attachment', contentType: 'application/pdf', size: 1, postId: 1 }),
    ).toEqual(['name: The file needs a name'])
    expect(
      messages({
        purpose: 'attachment',
        contentType: 'application/pdf',
        size: 1,
        name: '   ',
        postId: 1,
      }),
    ).toHaveLength(1)
    expect(
      messages({
        purpose: 'attachment',
        contentType: 'application/pdf',
        size: 1,
        name: 'x'.repeat(256),
        postId: 1,
      }),
    ).toHaveLength(1)
    expect(
      createUploadInput.parse({
        purpose: 'attachment',
        contentType: 'application/pdf',
        size: 1,
        name: ' a.pdf ',
        postId: 1,
      }).name,
    ).toBe('a.pdf')
  })

  it('needs the post an attachment is for, as a positive int4 id, and ignores it for an avatar', () => {
    const attachment = { purpose: 'attachment', contentType: 'application/pdf', size: 1, name: 'a' }
    expect(messages(attachment)).toEqual(['postId: Choose the post for the file'])
    for (const postId of [0, -1, 1.5, 2147483648]) {
      expect(messages({ ...attachment, postId }), String(postId)).toHaveLength(1)
    }
    expect(messages({ ...attachment, postId: 3 })).toEqual([])
    expect(messages({ purpose: 'avatar', contentType: 'image/png', size: 1 })).toEqual([])
  })

  it('rejects an empty file, a fractional size and an unknown purpose', () => {
    expect(messages({ purpose: 'avatar', contentType: 'image/png', size: 0 })).toEqual([
      'size: The file is empty',
    ])
    expect(messages({ purpose: 'avatar', contentType: 'image/png', size: 1.5 })).toHaveLength(1)
    expect(messages({ purpose: 'banner', contentType: 'image/png', size: 1 })).toHaveLength(1)
  })
})
