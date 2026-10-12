import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { ROUTE_ADMIN, ROUTE_SETTINGS } from '@/lib/constants-routes'
import { siteUrl } from '@/lib/data/site'

/**
 * `/robots.txt`: crawl everything but the signed-in areas and the API, and find the sitemap.
 * Views that are public but not worth indexing (auth pages, filtered lists, the UI kit) stay
 * crawlable and say `noindex` themselves, which a crawler can only read on a page it may fetch.
 * Built per request, so the sitemap URL is the running deployment's origin, not the build's.
 */
const robots = async (): Promise<MetadataRoute.Robots> => {
  await connection()
  return {
    rules: { userAgent: '*', allow: '/', disallow: [ROUTE_ADMIN, ROUTE_SETTINGS, '/api/'] },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  }
}

export default robots
