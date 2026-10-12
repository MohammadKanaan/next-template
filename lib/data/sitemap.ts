import 'server-only'
import { MINUTE } from '@/lib/constants-time'
import { SITEMAP_MAX_POSTS, sitemapPostsSchema, type SitemapPost } from '@/lib/dto/sitemap'
import { remember } from '@/lib/server/cache'
import { POSTS_TAG } from './cacheTags'
import { db } from './db'

const SITEMAP_CACHE_TTL = 30 * MINUTE

/**
 * Public: every published post with when its record last changed, newest first (at most
 * `SITEMAP_MAX_POSTS`). Drafts are never listed. The same for every viewer, so it is cached until
 * a post write invalidates `POSTS_TAG`.
 */
export const getSitemapPosts = async (): Promise<SitemapPost[]> => {
  return remember(
    'sitemap:posts',
    { ttl: SITEMAP_CACHE_TTL, tags: [POSTS_TAG], schema: sitemapPostsSchema },
    () =>
      db.post.findMany({
        where: { published: true },
        select: { id: true, updatedAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SITEMAP_MAX_POSTS,
      }),
  )
}
