import { describe, expect, it } from 'vitest'
import {
  ROUTE_ADMIN,
  ROUTE_POST_DETAILS,
  ROUTE_POST_EDIT,
  isPrivateRoute,
  isPublicRoute,
  loginPath,
  safeRedirectPath,
} from '@/lib/constants-routes'

describe('route helpers', () => {
  it('builds encoded post routes', () => {
    expect(ROUTE_POST_DETAILS(3, 'a b')).toBe('/posts/3/a%20b')
    expect(ROUTE_POST_EDIT(3, 7)).toBe('/posts/3/7/edit')
  })

  it('treats listing and detail pages as public', () => {
    for (const path of [
      '/',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/posts',
      '/posts/ssr',
      '/posts/1/2',
      '/ui-kit',
    ]) {
      expect(isPublicRoute(path)).toBe(true)
    }
  })

  it('treats authoring pages and unknown pages as private', () => {
    for (const path of ['/posts/new', '/posts/1/2/edit', '/private', '/admin', '/anything']) {
      expect(isPrivateRoute(path)).toBe(true)
    }
  })

  it('keeps the admin area private, subpaths included', () => {
    expect(ROUTE_ADMIN).toBe('/admin')
    expect(isPrivateRoute(ROUTE_ADMIN)).toBe(true)
    expect(isPrivateRoute('/admin/users')).toBe(true)
  })

  it('builds a login path that carries the return target', () => {
    expect(loginPath('/posts/new?x=1')).toBe('/login?next=%2Fposts%2Fnew%3Fx%3D1')
  })

  it('rejects backslash and control-character tricks that browsers read as another host', () => {
    for (const value of [
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '\\evil.example',
      '/.//evil.example',
      '/..//evil.example',
      '/a/..//evil.example',
      '/./\\evil.example',
    ]) {
      expect(safeRedirectPath(value)).toBe('/private')
    }
  })

  it('only accepts same-origin relative redirect targets', () => {
    expect(safeRedirectPath('/posts/new')).toBe('/posts/new')
    expect(safeRedirectPath('/posts/new?x=1#h')).toBe('/posts/new?x=1#h')
    expect(safeRedirectPath('//evil.example')).toBe('/private')
    expect(safeRedirectPath('https://evil.example')).toBe('/private')
    expect(safeRedirectPath(undefined, '/')).toBe('/')
  })
})
