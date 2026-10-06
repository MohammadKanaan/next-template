import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { ROUTE_LOGIN, isPrivateRoute } from '@/lib/constants-routes'

/**
 * Optimistic redirect from cookie presence only. Real checks live in the DAL. Signed-in visitors on
 * `/login` and `/signup` are redirected by those pages, because a stale cookie must not lock anyone out.
 */
export const proxy = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl
  const hasSession = getSessionCookie(request) !== null

  if (!hasSession && isPrivateRoute(pathname)) {
    const url = new URL(ROUTE_LOGIN, request.url)
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
