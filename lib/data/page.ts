import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { loginPath } from '@/lib/constants-routes'
import { NotFoundError, UnauthorizedError } from './errors'

/**
 * Runs a DAL read for a Server Component page. Signed out → login (returning to `path`),
 * missing record → the not-found page. Other errors propagate to the error boundary.
 */
export async function loadPage<T>(load: () => Promise<T>, path: string): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(loginPath(path))
    }
    if (error instanceof NotFoundError) {
      notFound()
    }
    throw error
  }
}
