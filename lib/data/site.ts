import 'server-only'

/** Where `next dev` serves the app when `BETTER_AUTH_URL` is not set. */
const DEV_ORIGIN = 'http://localhost:3000'

/**
 * The app's public origin, for every absolute URL search engines and link previews read: canonical
 * links and Open Graph tags (the root layout's `metadataBase`), JSON-LD, robots.txt and the
 * sitemap. It is Better Auth's base URL, which production already requires to be absolute
 * (`assertAuthEnv`), so the links in emails and the links in search results cannot disagree. Read
 * from `process.env` like `lib/data/auth.ts` does, when called, so a build without it is fine.
 */
export const siteUrl = (): URL => new URL(process.env.BETTER_AUTH_URL || DEV_ORIGIN)
