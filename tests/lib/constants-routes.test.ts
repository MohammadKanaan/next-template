import { describe, expect, it } from 'vitest'
import { isPrivateRoute, isPublicRoute, safeRedirectPath } from '@/lib/constants-routes'

describe('route helpers', () => {
  it('treats listing and detail pages as public', () => {
    for (const path of [
      '/',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/posts',
      '/posts/12',
      '/ui-kit',
    ]) {
      expect(isPublicRoute(path)).toBe(true)
    }
  })

  it('treats authoring pages and unknown pages as private', () => {
    for (const path of [
      '/posts/new',
      '/posts/mine',
      '/posts/mine/',
      '/posts/12/edit',
      '/settings',
      '/admin',
      '/admin/users',
      '/anything',
    ]) {
      expect(isPrivateRoute(path)).toBe(true)
    }
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
      expect(safeRedirectPath(value)).toBe('/')
    }
  })

  it('only accepts same-origin relative redirect targets, landing on the home page otherwise', () => {
    expect(safeRedirectPath('/posts/new')).toBe('/posts/new')
    expect(safeRedirectPath('/posts/new?x=1#h')).toBe('/posts/new?x=1#h')
    expect(safeRedirectPath('//evil.example')).toBe('/')
    expect(safeRedirectPath('https://evil.example')).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath(undefined, '/settings')).toBe('/settings')
  })
})
