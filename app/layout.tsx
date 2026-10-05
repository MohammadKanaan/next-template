import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { env } from '@/lib/env'
import '@/components/SCN/tailwind/styles.css'
import '@/styles/global.scss'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: { default: env.appName, template: `%s | ${env.appName}` },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
