type RouteParameter = string | number

const encode = (value: RouteParameter) => encodeURIComponent(String(value))

export const ROUTE_HOME = '/'
export const ROUTE_LOGIN = '/login'
export const ROUTE_PRIVATE = '/private'
export const ROUTE_POSTS = '/posts'
export const ROUTE_POSTS_SSR = `${ROUTE_POSTS}/ssr`
export const ROUTE_POSTS_CSR = `${ROUTE_POSTS}/csr`
export const ROUTE_POST_NEW = `${ROUTE_POSTS}/new`
export const ROUTE_UI_KIT = '/ui-kit'

export const ROUTE_POST_DETAILS = (userId: RouteParameter, postId: RouteParameter) =>
  `${ROUTE_POSTS}/${encode(userId)}/${encode(postId)}`

export const ROUTE_POST_EDIT = (userId: RouteParameter, postId: RouteParameter) =>
  `${ROUTE_POST_DETAILS(userId, postId)}/edit`

export const PUBLIC_ROUTES = [ROUTE_HOME, ROUTE_LOGIN, ROUTE_POSTS, ROUTE_UI_KIT] as const

const AUTHORING_ROUTE_PATTERN = /^\/posts\/(?:new|[^/]+\/[^/]+\/edit)\/?$/

export const isPublicRoute = (path: string): boolean =>
  !AUTHORING_ROUTE_PATTERN.test(path) &&
  PUBLIC_ROUTES.some(
    (route) => path === route || (route !== ROUTE_HOME && path.startsWith(`${route}/`)),
  )

export const isPrivateRoute = (path: string): boolean => !isPublicRoute(path)

export function safeRedirectPath(value: string | null | undefined, fallback = ROUTE_PRIVATE) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}
