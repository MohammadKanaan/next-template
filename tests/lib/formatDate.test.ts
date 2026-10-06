import { describe, expect, it } from 'vitest'
import { formatDateTime } from '@/lib/formatDate'

describe('formatDateTime', () => {
  it('formats in UTC with a fixed locale, so server and client agree', () => {
    expect(formatDateTime(new Date('2026-10-05T15:04:00.000Z'))).toBe('Oct 5, 2026, 3:04 PM UTC')
    expect(formatDateTime(new Date('2026-01-01T00:00:00.000Z'))).toBe('Jan 1, 2026, 12:00 AM UTC')
  })
})
