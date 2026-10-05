'use client'

import type { ReactNode } from 'react'
import { Toaster } from '@/components/SCN/sonner'
import { TooltipProvider } from '@/components/SCN/tooltip'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  )
}
