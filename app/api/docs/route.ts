import { ApiReference } from '@scalar/nextjs-api-reference'
import { env } from '@/lib/env'

export const GET = ApiReference({
  url: '/api/openapi',
  pageTitle: `${env.appName} API`,
  // Pin the browser renderer separately from the Next.js integration's package version.
  cdn: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.1/dist/browser/standalone.js',
  proxyUrl: '',
  telemetry: false,
})
