import type { NextConfig } from 'next'
import { BREAKPOINTS } from './lib/constants-breakpoints'

const scssBreakpoints = Object.entries(BREAKPOINTS)
  .map(([name, value]) => `$breakpoint-${name}: ${value};`)
  .join('\n')

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: 'standalone',
  sassOptions: {
    additionalData: scssBreakpoints,
  },
}

export default nextConfig
