'use client'

import type { z } from 'zod'
import { useBrowserStorage } from './useBrowserStorage'

/** Like `useLocalStorage`, but kept in `sessionStorage`: it lasts until the tab is closed. */
export const useSessionStorage = <S extends z.ZodType>(key: string, schema: S) => {
  return useBrowserStorage('sessionStorage', key, schema)
}
