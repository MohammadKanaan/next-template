// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined)

const SESSION_COOKIE = 'better-auth.session_token=abc.def'

describe('proxy', () => {
  it('sends signed-out visitors from private pages to login with a return path', () => {
    const response = proxy(request('/private'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fprivate')
  })

  it('sends signed-out visitors from the admin page to login', () => {
    const response = proxy(request('/admin?q=ada'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fadmin%3Fq%3Dada')
  })

  it('lets a visitor with a session cookie through to private pages', () => {
    expect(proxy(request('/private', SESSION_COOKIE)).headers.get('x-middleware-next')).toBe('1')
  })

  it('does not redirect guest-only pages: a stale cookie must not lock anyone out', () => {
    for (const path of ['/login', '/signup']) {
      const response = proxy(request(path, SESSION_COOKIE))
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('location')).toBeNull()
    }
  })

  it('lets signed-out visitors reach the password reset pages', () => {
    for (const path of ['/forgot-password', '/reset-password']) {
      expect(proxy(request(`${path}?token=abc`)).headers.get('x-middleware-next')).toBe('1')
    }
  })

  it('lets anyone through to public pages', () => {
    expect(proxy(request('/posts')).headers.get('x-middleware-next')).toBe('1')
  })
})
