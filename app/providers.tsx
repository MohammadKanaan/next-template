'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/SCN/sonner'
import { TooltipProvider } from '@/components/SCN/tooltip'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
