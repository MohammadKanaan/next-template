type RouteParameter = string | number

const encode = (value: RouteParameter) => encodeURIComponent(String(value))

export const ROUTE_HOME = '/'
export const ROUTE_LOGIN = '/login'
export const ROUTE_SIGNUP = '/signup'
export const ROUTE_FORGOT_PASSWORD = '/forgot-password'
export const ROUTE_RESET_PASSWORD = '/reset-password'
export const ROUTE_PRIVATE = '/private'
export const ROUTE_SETTINGS = '/settings'
export const ROUTE_POSTS = '/posts'
export const ROUTE_POSTS_SSR = `${ROUTE_POSTS}/ssr`
export const ROUTE_POSTS_CSR = `${ROUTE_POSTS}/csr`
export const ROUTE_POST_NEW = `${ROUTE_POSTS}/new`
export const ROUTE_UI_KIT = '/ui-kit'

export const loginPath = (next: string) => `${ROUTE_LOGIN}?next=${encodeURIComponent(next)}`

export const ROUTE_POST_DETAILS = (userId: RouteParameter, postId: RouteParameter) =>
  `${ROUTE_POSTS}/${encode(userId)}/${encode(postId)}`

export const ROUTE_POST_EDIT = (userId: RouteParameter, postId: RouteParameter) =>
  `${ROUTE_POST_DETAILS(userId, postId)}/edit`

export const PUBLIC_ROUTES = [
  ROUTE_HOME,
  ROUTE_LOGIN,
  ROUTE_SIGNUP,
  ROUTE_FORGOT_PASSWORD,
  ROUTE_RESET_PASSWORD,
  ROUTE_POSTS,
  ROUTE_UI_KIT,
] as const

const AUTHORING_ROUTE_PATTERN = /^\/posts\/(?:new|[^/]+\/[^/]+\/edit)\/?$/

export const isPublicRoute = (path: string): boolean =>
  !AUTHORING_ROUTE_PATTERN.test(path) &&
  PUBLIC_ROUTES.some(
    (route) => path === route || (route !== ROUTE_HOME && path.startsWith(`${route}/`)),
  )

export const isPrivateRoute = (path: string): boolean => !isPublicRoute(path)

const REDIRECT_BASE = 'http://localhost'

/**
 * Accepts only same-origin relative targets. The value is resolved the way a browser would, so
 * `/\\evil.example` and `/<TAB>/evil.example` (which browsers read as `//evil.example`) fall back.
 * Dot segments can also normalise to a `//` path (`/.//evil.example`), which a browser would treat
 * as protocol-relative, so the resolved path is checked too.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = ROUTE_PRIVATE) {
  if (!value || !value.startsWith('/')) {
    return fallback
  }
  try {
    const url = new URL(value, REDIRECT_BASE)
    if (url.origin !== REDIRECT_BASE || url.pathname.startsWith('//')) {
      return fallback
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
