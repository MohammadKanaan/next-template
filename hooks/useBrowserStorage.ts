'use client'

import { useSyncExternalStore } from 'react'
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

/** Missing, malformed or no-longer-valid (a changed schema) all read as "nothing stored". */
const parseStored = <S extends z.ZodType>(raw: string | null, schema: S): z.output<S> | null => {
  if (raw === null) {
    return null
  }
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Shared engine of `useLocalStorage` and `useSessionStorage`. The snapshot is the raw stored
 * string, so React compares cheap strings and the parse runs once per change. `schema` should be
 * a module-level constant: a new schema on every render would re-parse on every render.
 */
export const useBrowserStorage = <S extends z.ZodType>(
  area: StorageArea,
  key: string,
  schema: S,
) => {
  const raw = useSyncExternalStore(
    (onChange) => subscribeStorage(area, key, onChange),
    () => readStorage(area, key),
    getServerSnapshot,
  )
  const value = parseStored(raw, schema)

  const setValue = (next: z.output<S>) => writeStorage(area, key, JSON.stringify(next))
  const removeValue = () => removeStorage(area, key)

  return { value, setValue, removeValue }
}
