import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { ROUTE_HOME, ROUTE_POST_DETAILS, ROUTE_POSTS } from '@/lib/constants-routes'
import { siteUrl } from '@/lib/data/site'
import { getSitemapPosts } from '@/lib/data/sitemap'

/**
 * `/sitemap.xml`: the pages worth indexing, which are the ones with a canonical URL: home, the
 * post list and every published post. Built per request, so `next build` needs no database and the
 * sitemap never lags the posts (the DAL caches it). One sitemap holds 50,000 URLs; past that,
 * split it with `generateSitemaps`.
 */
const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  await connection()
  const origin = siteUrl()
  const url = (path: string) => new URL(path, origin).toString()
  const posts = await getSitemapPosts()

  return [
    { url: url(ROUTE_HOME) },
    { url: url(ROUTE_POSTS) },
    ...posts.map((post) => ({
      url: url(ROUTE_POST_DETAILS(post.id)),
      lastModified: post.updatedAt,
    })),
  ]
}

export default sitemap
