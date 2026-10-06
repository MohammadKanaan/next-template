// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerEnv, serverEnv } from '@/lib/server/env'

const valid = {
  REDIS_URL: 'redis://localhost:6379/15',
  EMAIL_FROM: 'App <noreply@example.com>',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_URL: 'http://localhost:9000/bucket',
}

const stubEnv = (values: Record<string, string | undefined>) => {
  for (const [name, value] of Object.entries({ RESEND_API_KEY: undefined, ...values })) {
    vi.stubEnv(name, value)
  }
}

describe('serverEnv', () => {
  beforeEach(resetServerEnv)
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
  })

  it('returns the parsed config, with RESEND_API_KEY optional', () => {
    stubEnv(valid)
    expect(serverEnv()).toMatchObject(valid)
    expect(serverEnv().RESEND_API_KEY).toBeUndefined()
  })

  it('treats empty optional variables as unset', () => {
    stubEnv({ ...valid, RESEND_API_KEY: '', S3_PUBLIC_ENDPOINT: '' })
    expect(serverEnv().RESEND_API_KEY).toBeUndefined()
    expect(serverEnv().S3_PUBLIC_ENDPOINT).toBeUndefined()
  })

  it('accepts a browser-facing S3 endpoint and rejects a malformed one', () => {
    stubEnv({ ...valid, S3_PUBLIC_ENDPOINT: 'https://files.example.com' })
    expect(serverEnv().S3_PUBLIC_ENDPOINT).toBe('https://files.example.com')
    resetServerEnv()
    stubEnv({ ...valid, S3_PUBLIC_ENDPOINT: 'not a url' })
    expect(() => serverEnv()).toThrow(/S3_PUBLIC_ENDPOINT/)
  })

  it('memoizes the first successful parse', () => {
    stubEnv(valid)
    const first = serverEnv()
    stubEnv({ ...valid, REDIS_URL: 'redis://elsewhere' })
    expect(serverEnv()).toBe(first)
  })

  it('lists every missing or invalid variable in one error', () => {
    stubEnv({ ...valid, REDIS_URL: undefined, S3_BUCKET: undefined, S3_ENDPOINT: 'not a url' })
    expect(() => serverEnv()).toThrow(/REDIS_URL[\s\S]*S3_ENDPOINT[\s\S]*S3_BUCKET/)
  })
})
