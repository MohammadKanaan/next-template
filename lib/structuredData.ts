import type { Article, WebSite, WithContext } from 'schema-dts'
import { ROUTE_HOME, ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { PostDetail } from '@/lib/dto/posts'
import { env } from '@/lib/env'
import { metaDescription } from '@/lib/seo'

// schema.org JSON-LD for the public pages (rendered by `components/JsonLd`). Every URL is
// absolute, on the origin the page passes in (`siteUrl()`), because structured data has no
// `metadataBase` to resolve a path against.

const absolute = (path: string, origin: URL) => new URL(path, origin).toString()

/** The site itself, on the home page: how search engines learn its name. */
export const websiteJsonLd = (origin: URL): WithContext<WebSite> => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: env.appName,
  url: absolute(ROUTE_HOME, origin),
})

/** A published post with its author. A draft is never rendered with structured data. */
export const postJsonLd = (post: PostDetail, origin: URL): WithContext<Article> => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: post.title,
  url: absolute(ROUTE_POST_DETAILS(post.id), origin),
  description: metaDescription(post.body),
  datePublished: post.createdAt.toISOString(),
  dateModified: post.updatedAt.toISOString(),
  author: {
    '@type': 'Person',
    name: post.author.name,
    ...(post.author.website ? { url: post.author.website } : {}),
  },
})
