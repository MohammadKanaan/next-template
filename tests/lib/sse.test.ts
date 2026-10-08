import { describe, expect, it } from 'vitest'
import { formatSseComment, formatSseEvent } from '@/lib/sse'

describe('sse', () => {
  it('frames a JSON data event and a comment', () => {
    expect(formatSseEvent({ type: 'unread', count: 1 })).toBe(
      'data: {"type":"unread","count":1}\n\n',
    )
    expect(formatSseComment('ping')).toBe(': ping\n\n')
  })
})
