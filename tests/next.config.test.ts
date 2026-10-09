import { describe, expect, it } from 'vitest'
import nextConfig, { SECURITY_HEADERS } from '@/next.config'

const EXPECTED_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

describe('next.config', () => {
  it('hides the X-Powered-By header', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it('serves the security headers on every path', async () => {
    expect(await nextConfig.headers!()).toEqual([{ source: '/(.*)', headers: SECURITY_HEADERS }])
  })

  it.each(Object.entries(EXPECTED_HEADERS))('sends %s once with its exact value', (key, value) => {
    expect(SECURITY_HEADERS.filter((header) => header.key === key)).toEqual([{ key, value }])
  })
})
