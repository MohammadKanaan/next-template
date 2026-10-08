import { describe, expect, it } from 'vitest'
import { formatBytes } from '@/lib/formatBytes'

describe('formatBytes', () => {
  it('uses binary units with one decimal only when needed', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB')
    expect(formatBytes(5000 * 1024 ** 3)).toBe('5000 GB')
  })

  it('treats a negative size as zero', () => {
    expect(formatBytes(-5)).toBe('0 B')
  })
})
