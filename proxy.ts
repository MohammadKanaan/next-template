import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { ROUTE_LOGIN, isPrivateRoute } from '@/lib/constants-routes'
import { contentSecurityPolicy, createNonce } from '@/lib/csp'

/**
 * Optimistic redirect from cookie presence only. Real checks live in the DAL. Signed-in visitors on
 * `/login` and `/signup` are redirected by those pages, because a stale cookie must not lock anyone out.
 *
 * Every page that renders gets its Content-Security-Policy here, with a nonce of its own: on the
 * request, where Next finds the nonce for its scripts, and on the response, which the browser
 * enforces. The root layout reads the request headers, so no page is prerendered with a stale nonce.
 */
export const proxy = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl
  const hasSession = getSessionCookie(request) !== null

  if (!hasSession && isPrivateRoute(pathname)) {
    const url = new URL(ROUTE_LOGIN, request.url)
    url.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  const nonce = createNonce()
  const policy = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === 'development' })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
