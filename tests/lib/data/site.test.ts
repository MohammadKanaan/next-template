// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteUrl } from '@/lib/data/site'

describe('siteUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is the origin Better Auth runs on', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://app.example')
    expect(siteUrl().toString()).toBe('https://app.example/')
  })

  it('falls back to the dev server when unset or empty', () => {
    vi.stubEnv('BETTER_AUTH_URL', '')
    expect(siteUrl().toString()).toBe('http://localhost:3000/')
  })
})
