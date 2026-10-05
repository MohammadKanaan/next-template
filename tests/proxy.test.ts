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

  it('lets a visitor with a session cookie through to private pages', () => {
    expect(proxy(request('/private', SESSION_COOKIE)).headers.get('x-middleware-next')).toBe('1')
  })

  it('keeps signed-in visitors off the guest-only pages', () => {
    const response = proxy(request('/signup', SESSION_COOKIE))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/')
  })

  it('lets anyone through to public pages', () => {
    expect(proxy(request('/posts')).headers.get('x-middleware-next')).toBe('1')
  })
})
