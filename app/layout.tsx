import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import { Providers } from '@/app/providers'
import { siteUrl } from '@/lib/data/site'
import { env } from '@/lib/env'
import { SITE_DESCRIPTION, SITE_OPEN_GRAPH } from '@/lib/seo'
import '@/styles/global.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

// Pages inherit these unless they set their own: Open Graph and Twitter titles and descriptions
// follow each page's `title` and `description`, and a page's relative URLs resolve on `metadataBase`.
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: env.appName, template: `%s | ${env.appName}` },
  description: SITE_DESCRIPTION,
  applicationName: env.appName,
  openGraph: { ...SITE_OPEN_GRAPH, type: 'website' },
  twitter: { card: 'summary' },
}

const RootLayout = async ({ children }: LayoutProps<'/'>) => {
  // The request's CSP nonce (`proxy.ts`), for the one inline script Next does not render itself.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      {/* `suppressHydrationWarning` also covers attributes browser extensions inject
          into <body> (e.g. `cz-shortcut-listen`) before React hydrates. */}
      <body suppressHydrationWarning>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  )
}

export default RootLayout
