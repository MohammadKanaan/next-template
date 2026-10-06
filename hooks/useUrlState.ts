'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'
import type { z } from 'zod'
import { toScalarParams } from '@/lib/searchParams'

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
 * Each patch is built on the last query it requested, not on the committed URL, so two patches
 * issued before the first navigation lands (a search and a sort change, say) both survive.
 * `isPending` is true while that navigation (and the server render it triggers) is in flight.
 * On a page that reads nothing on the server (so it could be prerendered), the caller must sit
 * inside `<Suspense>`: `useSearchParams` requires it there. Pages that use `loadPage` need none.
 */
export const useUrlState = <S extends z.ZodObject>(
  schema: S,
  { history }: UrlStateOptions = {},
) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const search = searchParams.toString()

  // `committed` is the URL React has rendered; `requested` is the newest query a patch asked for
  // (null until one does) and is dropped whenever the committed URL changes.
  const latest = useRef({ committed: search, requested: null as string | null, pathname })
  useEffect(() => {
    latest.current = { committed: search, requested: null, pathname }
  }, [search, pathname])

  const state: z.output<S> = schema.parse(toScalarParams(new URLSearchParams(search)))
  const defaults: z.output<S> = schema.parse({})

  const setState = (patch: Partial<z.output<S>>) => {
    const current = latest.current
    const next = new URLSearchParams(current.requested ?? current.committed)
    for (const [key, value] of Object.entries(patch)) {
      const isDefault = String(value) === String(defaults[key])
      if (value === undefined || value === null || value === '' || isDefault) {
        next.delete(key)
      } else {
        next.set(key, String(value))
      }
    }
    const query = next.toString()
    current.requested = query
    const href = query ? `${current.pathname}?${query}` : current.pathname
    startTransition(() => {
      if (history === 'push') {
        router.push(href, { scroll: false })
      } else {
        router.replace(href, { scroll: false })
      }
    })
  }

  return { state, setState, isPending }
}
