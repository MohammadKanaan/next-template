import { describe, expect, it } from 'vitest'
import { toExcerpt } from '@/lib/excerpt'

describe('toExcerpt', () => {
  it('returns text that already fits untouched', () => {
    expect(toExcerpt('short', 10)).toBe('short')
    expect(toExcerpt('exactly10!', 10)).toBe('exactly10!')
  })

  it('cuts long text to max characters including the ellipsis', () => {
    expect(toExcerpt('x'.repeat(600), 140)).toBe(`${'x'.repeat(139)}…`)
    expect(toExcerpt('x'.repeat(600), 140)).toHaveLength(140)
  })

  it('trims whitespace before the ellipsis', () => {
    expect(toExcerpt('abc   def', 6)).toBe('abc…')
  })

  it('never cuts an emoji in half', () => {
    // '😀' is two UTF-16 code units; a cut between them leaves a lone surrogate that renders as �.
    expect(toExcerpt('ab😀cd', 4)).toBe('ab…')
    expect(toExcerpt('ab😀cd', 5)).toBe('ab😀…')
    expect(toExcerpt('a😀😀😀', 5)).toBe('a😀…')
    for (const max of [3, 4, 5, 6, 7]) {
      expect(toExcerpt('a😀😀😀😀', max)).not.toMatch(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
      )
    }
  })

  it('keeps length within max (UTF-16 units) for astral characters', () => {
    const astral = '😀'.repeat(300)
    for (const max of [1, 2, 3, 10, 139, 140, 200]) {
      const result = toExcerpt(astral, max)
      expect(result.length).toBeLessThanOrEqual(max)
      expect(Array.from(result).every((character) => character === '😀' || character === '…')).toBe(
        true,
      )
    }
  })
})
