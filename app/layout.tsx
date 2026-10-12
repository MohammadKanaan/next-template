import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import { Providers } from '@/app/providers'
import { env } from '@/lib/env'
import '@/styles/global.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: { default: env.appName, template: `%s | ${env.appName}` },
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
