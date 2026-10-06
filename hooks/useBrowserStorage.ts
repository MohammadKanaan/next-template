'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { z } from 'zod'
import {
  readStorage,
  removeStorage,
  subscribeStorage,
  writeStorage,
  type StorageArea,
} from '@/lib/browserStorage'

/** The server (and the hydrating client render) has no storage, so it always sees `null`. */
const getServerSnapshot = () => null

/**
 * Shared engine of `useLocalStorage` and `useSessionStorage`. The snapshot is the raw stored
 * string, so React compares cheap strings and the parse runs once per change. `schema` should be
 * a module-level constant: a new schema on every render would re-parse on every render.
 */
export function useBrowserStorage<S extends z.ZodType>(area: StorageArea, key: string, schema: S) {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeStorage(area, key, onChange),
    [area, key],
  )
  const getSnapshot = useCallback(() => readStorage(area, key), [area, key])
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Missing, malformed or no-longer-valid (a changed schema) all read as "nothing stored".
  const value = useMemo((): z.output<S> | null => {
    if (raw === null) {
      return null
    }
    try {
      const parsed = schema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }, [raw, schema])

  const setValue = useCallback(
    (next: z.output<S>) => {
      writeStorage(area, key, JSON.stringify(next))
    },
    [area, key],
  )
  const removeValue = useCallback(() => removeStorage(area, key), [area, key])

  return { value, setValue, removeValue }
}
