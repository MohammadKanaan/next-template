'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useTransition } from 'react'
import type { z } from 'zod'

type UrlStateOptions = {
  /** `replace` (default) keeps the back button for page navigation; `push` adds an entry. */
  history?: 'replace' | 'push'
}

/**
 * State that lives in the URL's query string, typed and validated by a Zod object whose fields all
 * have `.default()` or `.catch()`, so any URL parses (`?sort=garbage` falls back to the default
 * instead of becoming a mistyped value). Scalars only: string, number, boolean or enum fields.
 *
 * `setState(patch)` writes the whole patch in one navigation. A key whose value is empty or equal
 * to the schema default is removed from the URL, and params the schema does not know are kept.
 * `isPending` is true while that navigation (and the server render it triggers) is in flight.
 * Callers must sit inside `<Suspense>`: `useSearchParams` requires it under Cache Components.
 */
export function useUrlState<S extends z.ZodObject>(schema: S, { history }: UrlStateOptions = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const state: z.output<S> = useMemo(
    () => schema.parse(Object.fromEntries(searchParams)),
    [schema, searchParams],
  )
  const defaults: z.output<S> = useMemo(() => schema.parse({}), [schema])

  const setState = useCallback(
    (patch: Partial<z.output<S>>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        const isDefault = String(value) === String(defaults[key])
        if (value === undefined || value === null || value === '' || isDefault) {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      }
      const query = next.toString()
      const href = query ? `${pathname}?${query}` : pathname
      startTransition(() => {
        if (history === 'push') {
          router.push(href, { scroll: false })
        } else {
          router.replace(href, { scroll: false })
        }
      })
    },
    [defaults, history, pathname, router, searchParams],
  )

  return { state, setState, isPending }
}
