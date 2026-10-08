import { describe, expect, it } from 'vitest'
import { pushEndpointSchema, pushSubscriptionInput } from '@/lib/dto/push'

describe('push DTOs', () => {
  it('accepts the shape of PushSubscription.toJSON()', () => {
    const input = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
      expirationTime: null,
    }
    expect(pushSubscriptionInput.parse(input)).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    })
  })

  it('rejects a non-URL endpoint and empty keys', () => {
    expect(
      pushSubscriptionInput.safeParse({ endpoint: 'nope', keys: { p256dh: 'p', auth: 'a' } })
        .success,
    ).toBe(false)
    expect(
      pushSubscriptionInput.safeParse({
        endpoint: 'https://p.example',
        keys: { p256dh: '', auth: 'a' },
      }).success,
    ).toBe(false)
    expect(pushEndpointSchema.safeParse('https://p.example/x').success).toBe(true)
    expect(pushEndpointSchema.safeParse('x').success).toBe(false)
  })

  it('accepts https endpoints only and bounds their length', () => {
    expect(pushEndpointSchema.safeParse('http://push.example/x').success).toBe(false)
    expect(pushEndpointSchema.safeParse('ftp://push.example/x').success).toBe(false)
    expect(pushEndpointSchema.safeParse('https://push.example/' + 'a'.repeat(2048)).success).toBe(
      false,
    )
  })
})
