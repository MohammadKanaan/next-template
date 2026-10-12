import { describe, expect, it } from 'vitest'
import {
  META_DESCRIPTION_MAX_LENGTH,
  metaDescription,
  pagedPath,
  pagedTitle,
  postsCanonicalPath,
} from '@/lib/seo'

describe('metaDescription', () => {
  it('collapses whitespace and leaves a short text whole', () => {
    expect(metaDescription('  A   short\n\ntext  ')).toBe('A short text')
  })

  it('cuts a long text at the last whole word that fits, closed with an ellipsis', () => {
    const text = `${'word '.repeat(60)}end`
    const result = metaDescription(text)
    expect(result.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH)
    expect(result.endsWith('word…')).toBe(true)
  })

  it('does not leave punctuation before the ellipsis', () => {
    expect(metaDescription('First sentence, and then more', 20)).toBe('First sentence…')
  })

  it('cuts a single word longer than the limit mid-word', () => {
    expect(metaDescription('x'.repeat(40), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

describe('paged titles and paths', () => {
  it('names the page from the second on, and writes no page parameter for the first', () => {
    expect(pagedTitle('Posts', 1)).toBe('Posts')
    expect(pagedTitle('Posts', 3)).toBe('Posts · Page 3')
    expect(pagedPath('/posts', 1)).toBe('/posts')
    expect(pagedPath('/posts', 3)).toBe('/posts?page=3')
  })
})

describe('postsCanonicalPath', () => {
  it('is the list, page by page, for the default order', () => {
    expect(postsCanonicalPath({ page: 1, q: '', sort: 'newest' })).toBe('/posts')
    expect(postsCanonicalPath({ page: 2, q: '', sort: 'newest' })).toBe('/posts?page=2')
  })

  it('is null for a search or another order: the same posts as the list', () => {
    expect(postsCanonicalPath({ page: 1, q: 'ada', sort: 'newest' })).toBeNull()
    expect(postsCanonicalPath({ page: 1, q: '', sort: 'oldest' })).toBeNull()
  })
})
