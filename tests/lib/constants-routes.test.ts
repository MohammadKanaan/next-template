import { describe, expect, it } from 'vitest'
import {
  ROUTE_POST_DETAILS,
  ROUTE_POST_EDIT,
  isPrivateRoute,
  isPublicRoute,
  safeRedirectPath,
} from '@/lib/constants-routes'

describe('route helpers', () => {
  it('builds encoded post routes', () => {
    expect(ROUTE_POST_DETAILS(3, 'a b')).toBe('/posts/3/a%20b')
    expect(ROUTE_POST_EDIT(3, 7)).toBe('/posts/3/7/edit')
  })

  it('treats listing and detail pages as public', () => {
    for (const path of ['/', '/login', '/posts', '/posts/ssr', '/posts/1/2', '/ui-kit']) {
      expect(isPublicRoute(path)).toBe(true)
    }
  })

  it('treats authoring pages and unknown pages as private', () => {
    for (const path of ['/posts/new', '/posts/1/2/edit', '/private', '/anything']) {
      expect(isPrivateRoute(path)).toBe(true)
    }
  })

  it('only accepts same-origin relative redirect targets', () => {
    expect(safeRedirectPath('/posts/new')).toBe('/posts/new')
    expect(safeRedirectPath('//evil.example')).toBe('/private')
    expect(safeRedirectPath('https://evil.example')).toBe('/private')
    expect(safeRedirectPath(undefined, '/')).toBe('/')
  })
})
