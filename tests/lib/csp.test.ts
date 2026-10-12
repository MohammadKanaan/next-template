import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, createNonce } from '@/lib/csp'

const directives = (policy: string) =>
  new Map(
    policy.split('; ').map((directive) => {
      const [name, ...values] = directive.split(' ')
      return [name, values] as const
    }),
  )

describe('createNonce', () => {
  it('is base64 and different every time', () => {
    const nonce = createNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(createNonce()).not.toBe(nonce)
  })
})

describe('contentSecurityPolicy', () => {
  it('runs only scripts carrying the nonce, and what they load', () => {
    const policy = directives(contentSecurityPolicy('abc', { dev: false }))
    expect(policy.get('script-src')).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"])
    expect(policy.get('object-src')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'self'"])
    expect(policy.get('frame-ancestors')).toEqual(["'none'"])
    expect(policy.has('upgrade-insecure-requests')).toBe(true)
  })

  it('lets the browser upload to R2 and leave for Google sign-in', () => {
    const policy = directives(contentSecurityPolicy('abc', { dev: false }))
    expect(policy.get('connect-src')).toEqual(["'self'", 'https://*.r2.cloudflarestorage.com'])
    expect(policy.get('form-action')).toEqual(["'self'", 'https://accounts.google.com'])
  })

  it('allows eval and plain http only in development', () => {
    const policy = directives(contentSecurityPolicy('abc', { dev: true }))
    expect(policy.get('script-src')).toContain("'unsafe-eval'")
    expect(policy.has('upgrade-insecure-requests')).toBe(false)
  })
})
