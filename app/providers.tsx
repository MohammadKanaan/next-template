'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/SCN/sonner'
import { TooltipProvider } from '@/components/SCN/tooltip'
import { PINNED_THEME } from '@/lib/constants-theme'

type ProvidersProps = {
  children: ReactNode
  /** The request's CSP nonce, for next-themes' inline script (it sets the theme before paint). */
  nonce?: string
}

export const Providers = ({ children, nonce }: ProvidersProps) => {
  return (
    <ThemeProvider
      nonce={nonce}
      attribute="class"
      defaultTheme={PINNED_THEME ?? 'system'}
      forcedTheme={PINNED_THEME ?? undefined}
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
