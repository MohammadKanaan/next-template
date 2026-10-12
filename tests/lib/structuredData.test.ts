import { describe, expect, it } from 'vitest'
import type { PostDetail } from '@/lib/dto/posts'
import { postJsonLd, websiteJsonLd } from '@/lib/structuredData'

const origin = new URL('https://app.example')

const post: PostDetail = {
  id: '0190d1a2-0000-7000-8000-00000000ada0',
  title: 'Hello',
  body: 'The   first\npost.',
  published: true,
  createdAt: new Date('2026-10-05T15:04:00.000Z'),
  updatedAt: new Date('2026-10-06T09:00:00.000Z'),
  author: { id: 'u1', name: 'Ada', username: 'ada', website: null },
  permissions: { update: false, delete: false },
}

describe('websiteJsonLd', () => {
  it('names the site and gives its absolute home URL', () => {
    expect(websiteJsonLd(origin)).toMatchObject({
      '@type': 'WebSite',
      url: 'https://app.example/',
    })
  })
})

describe('postJsonLd', () => {
  it('describes the article with an absolute URL, ISO dates and its author', () => {
    expect(postJsonLd(post, origin)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hello',
      url: `https://app.example/posts/${post.id}`,
      description: 'The first post.',
      datePublished: '2026-10-05T15:04:00.000Z',
      dateModified: '2026-10-06T09:00:00.000Z',
      author: { '@type': 'Person', name: 'Ada' },
    })
  })

  it('links the author’s website when they have one', () => {
    const withSite = { ...post, author: { ...post.author, website: 'https://ada.example' } }
    expect(postJsonLd(withSite, origin).author).toMatchObject({ url: 'https://ada.example' })
  })
})
