import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE_NAME } from '@/lib/constants-auth'
import { ROUTE_HOME, ROUTE_LOGIN, isPrivateRoute } from '@/lib/constants-routes'

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.has(AUTH_COOKIE_NAME)

  if (!hasSession && isPrivateRoute(pathname)) {
    const url = new URL(ROUTE_LOGIN, request.url)
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  if (hasSession && pathname === ROUTE_LOGIN) {
    return NextResponse.redirect(new URL(ROUTE_HOME, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
