import { ROUTE_POSTS } from '@/lib/constants-routes'
import type { PostsUrlQuery } from '@/lib/dto/posts'
import { env } from '@/lib/env'

/** Search results show about this many characters of a description and cut the rest. */
export const META_DESCRIPTION_MAX_LENGTH = 160

/** The site's description: the home page's and every page's that has none of its own. */
export const SITE_DESCRIPTION =
  'A minimal Next.js starter with shadcn/ui, Prisma, and a typed API layer.'

/**
 * The Open Graph fields every page shares. A page that sets `openGraph` replaces the root
 * layout's object rather than merging into it, so it spreads these first.
 */
export const SITE_OPEN_GRAPH = { siteName: env.appName, locale: 'en_US' } as const

/** Out of search results, links still followed: private, transient and near-duplicate views. */
export const NO_INDEX = { index: false, follow: true } as const

/**
 * Text as a meta description: whitespace collapsed to single spaces, and when too long, cut at
 * the last whole word that fits and closed with an ellipsis.
 */
export const metaDescription = (text: string, max = META_DESCRIPTION_MAX_LENGTH): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) {
    return flat
  }
  const cut = flat.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const words = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return `${words.replace(/[\s,;:.!?–—-]+$/, '')}…`
}

/** A paged list's title: the first page is the list's own, later pages say which they are. */
export const pagedTitle = (title: string, page: number): string =>
  page > 1 ? `${title} · Page ${page}` : title

/** A paged list's URL: the first page carries no `page` parameter, as the list's links write it. */
export const pagedPath = (path: string, page: number): string =>
  page > 1 ? `${path}?${new URLSearchParams({ page: String(page) })}` : path

/**
 * The canonical path of a post list view, or null when it stays out of search results. The list
 * itself is a landing page, page by page. A title search or the oldest-first order shows the same
 * posts as the list (and searches are unbounded), so it is not indexed.
 */
export const postsCanonicalPath = ({ page, q, sort }: PostsUrlQuery): string | null =>
  q || sort !== 'newest' ? null : pagedPath(ROUTE_POSTS, page)
