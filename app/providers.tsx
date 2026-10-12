'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/SCN/sonner'
import { TooltipProvider } from '@/components/SCN/tooltip'

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
      defaultTheme="system"
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
