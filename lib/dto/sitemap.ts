import { z } from 'zod'

/** One post page as the sitemap lists it: its id and when its record last changed. */
export const sitemapPostSchema = z.object({
  id: z.string(),
  updatedAt: z.coerce.date(),
})

export type SitemapPost = z.infer<typeof sitemapPostSchema>

/** Every published post page, for `app/sitemap.ts`. */
export const sitemapPostsSchema = z.array(sitemapPostSchema)

/** One sitemap file holds 50,000 URLs, so the list stops there; past it, split with `generateSitemaps`. */
export const SITEMAP_MAX_POSTS = 49_000
