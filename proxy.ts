import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { ROUTE_HOME, ROUTE_LOGIN, ROUTE_SIGNUP, isPrivateRoute } from '@/lib/constants-routes'

const GUEST_ONLY_ROUTES: string[] = [ROUTE_LOGIN, ROUTE_SIGNUP]

/** Optimistic redirects from cookie presence only. Real checks live in the DAL. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = getSessionCookie(request) !== null

  if (!hasSession && isPrivateRoute(pathname)) {
    const url = new URL(ROUTE_LOGIN, request.url)
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (hasSession && GUEST_ONLY_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL(ROUTE_HOME, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
