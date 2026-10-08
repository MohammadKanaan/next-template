import { describe, expect, it } from 'vitest'
import {
  createNotificationInput,
  notificationSchema,
  realtimeEventSchema,
} from '@/lib/dto/notifications'

const notification = {
  id: 1,
  type: 'comment',
  title: 'Casey commented on "Post"',
  body: 'Nice',
  url: '/posts/u1/1',
  readAt: null,
  createdAt: '2026-10-07T10:00:00.000Z',
}

describe('notification DTOs', () => {
  it('revives dates when parsing JSON', () => {
    const parsed = notificationSchema.parse(notification)
    expect(parsed.createdAt).toBeInstanceOf(Date)
    expect(parsed.readAt).toBeNull()
    expect(
      notificationSchema.parse({ ...notification, readAt: notification.createdAt }).readAt,
    ).toBeInstanceOf(Date)
  })

  it('accepts only app paths and bounded text as a notification input', () => {
    const valid = { userId: 'u1', type: 'comment', title: ' T ', body: 'b', url: '/posts/u1/1' }
    expect(createNotificationInput.parse(valid)).toMatchObject({ title: 'T' })
    expect(
      createNotificationInput.safeParse({ ...valid, url: 'https://evil.example' }).success,
    ).toBe(false)
    expect(createNotificationInput.safeParse({ ...valid, url: '//evil.example' }).success).toBe(
      false,
    )
    expect(createNotificationInput.safeParse({ ...valid, title: '' }).success).toBe(false)
    expect(createNotificationInput.safeParse({ ...valid, title: 'x'.repeat(201) }).success).toBe(
      false,
    )
    expect(createNotificationInput.safeParse({ ...valid, type: 'other' }).success).toBe(false)
  })

  it('rejects urls a browser would resolve off-site, and keeps ordinary app paths', () => {
    const valid = { userId: 'u1', type: 'comment', title: 'T', body: 'b' }
    const accepts = (url: string) => createNotificationInput.safeParse({ ...valid, url }).success
    for (const url of [
      '/\\evil.example',
      '/\t/evil.example',
      '/.//evil.example',
      'javascript:alert(1)',
      '',
    ]) {
      expect(accepts(url), url).toBe(false)
    }
    expect(accepts('/posts/u/1?x=1#c')).toBe(true)
    expect(accepts('/')).toBe(true)
  })

  it('parses realtime events by type', () => {
    expect(realtimeEventSchema.parse({ type: 'unread', count: 2 })).toEqual({
      type: 'unread',
      count: 2,
    })
    const event = realtimeEventSchema.parse({ type: 'notification', notification })
    expect(event.type === 'notification' && event.notification.createdAt).toBeInstanceOf(Date)
    expect(realtimeEventSchema.safeParse({ type: 'unread', count: -1 }).success).toBe(false)
    expect(realtimeEventSchema.safeParse({ type: 'other' }).success).toBe(false)
  })
})
