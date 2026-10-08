import type { NextConfig } from 'next'
import { BREAKPOINTS } from './lib/constants-breakpoints'

const scssBreakpoints = Object.entries(BREAKPOINTS)
  .map(([name, value]) => `$breakpoint-${name}: ${value};`)
  .join('\n')

export const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // web-push is a Node package with its own HTTP client; it is loaded by the web process only to
  // read `isPushConfigured()`.
  serverExternalPackages: ['web-push'],
  sassOptions: {
    additionalData: scssBreakpoints,
  },
  headers: async () => [{ source: '/(.*)', headers: SECURITY_HEADERS }],
}

export default nextConfig
