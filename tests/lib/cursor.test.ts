import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from '@/lib/cursor'

describe('cursor', () => {
  it('round trips an id as url-safe text', () => {
    for (const id of [1, 9, 10, 123456, 2147483647]) {
      const cursor = encodeCursor(id)
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(decodeCursor(cursor)).toBe(id)
    }
  })

  it('is null for anything encodeCursor could not have made', () => {
    expect(decodeCursor('')).toBeNull()
    expect(decodeCursor('not a cursor!')).toBeNull()
    expect(decodeCursor('%%%')).toBeNull()
    // Valid base64url, but not a positive integer.
    expect(decodeCursor(btoa('abc'))).toBeNull()
    expect(decodeCursor(btoa('-5'))).toBeNull()
    expect(decodeCursor(btoa('0'))).toBeNull()
    expect(decodeCursor(btoa('1.5'))).toBeNull()
    expect(decodeCursor(btoa('007'))).toBeNull()
    // Larger than a Postgres int4.
    expect(decodeCursor(encodeCursor(2147483648))).toBeNull()
  })
})
