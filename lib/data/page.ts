import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { loginPath } from '@/lib/constants-routes'
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors'

/**
 * Runs a DAL read for a Server Component page. Signed out → login (returning to `path`),
 * missing record or not allowed → the not-found page (a page the viewer may not see, such as the
 * admin area, looks the same as one that does not exist). Other errors propagate to the error boundary.
 * Waits for a real request first, so no page read ever runs while `next build` prerenders.
 * Call it from a component wrapped in `<Suspense>`.
 */
export async function loadPage<T>(load: () => Promise<T>, path: string): Promise<T> {
  await connection()
  try {
    return await load()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(loginPath(path))
    }
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound()
    }
    throw error
  }
}
