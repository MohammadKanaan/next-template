'use client'

import type { z } from 'zod'
import { useBrowserStorage } from './useBrowserStorage'

/**
 * A Zod-typed value kept in `localStorage`, hydration-safe (`value` is `null` on the server and on
 * the first client render, then the stored value) and in sync across tabs and hook instances.
 * `value` is also `null` when nothing is stored or what is stored fails the schema.
 */
export function useLocalStorage<S extends z.ZodType>(key: string, schema: S) {
  return useBrowserStorage('localStorage', key, schema)
}
