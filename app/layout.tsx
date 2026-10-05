import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
