import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from '@/lib/push'

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    // "hello" in base64url
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })
})
