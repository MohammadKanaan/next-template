// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'

const connection = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('next/server', () => ({ connection }))

describe('robots.txt', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps crawlers out of the signed-in areas and the API, and points at the sitemap', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.example')
    expect(await robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/settings', '/api/'] },
      sitemap: 'https://app.example/sitemap.xml',
    })
  })

  it('is built per request, never frozen at build time', async () => {
    await robots()
    expect(connection).toHaveBeenCalled()
  })
})
