// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertAuthEnv, resetServerEnv, serverEnv } from '@/lib/server/env'

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
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: undefined,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    ...values,
  })) {
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

  it('accepts TRUSTED_PROXY_HOPS from 1 to 10, treats empty as unset, and rejects the rest', () => {
    stubEnv(valid)
    expect(serverEnv().TRUSTED_PROXY_HOPS).toBeUndefined()
    resetServerEnv()
    stubEnv({ ...valid, TRUSTED_PROXY_HOPS: '' })
    expect(serverEnv().TRUSTED_PROXY_HOPS).toBeUndefined()
    resetServerEnv()
    stubEnv({ ...valid, TRUSTED_PROXY_HOPS: '2' })
    expect(serverEnv().TRUSTED_PROXY_HOPS).toBe(2)
    for (const bad of ['0', '11', '1.5', 'many']) {
      resetServerEnv()
      stubEnv({ ...valid, TRUSTED_PROXY_HOPS: bad })
      expect(() => serverEnv()).toThrow(/TRUSTED_PROXY_HOPS/)
    }
  })

  it('treats the Google pair as optional, and empty values as unset', () => {
    stubEnv(valid)
    expect(serverEnv().GOOGLE_CLIENT_ID).toBeUndefined()
    resetServerEnv()
    stubEnv({ ...valid, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' })
    expect(serverEnv().GOOGLE_CLIENT_SECRET).toBeUndefined()
    resetServerEnv()
    stubEnv({ ...valid, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
    expect(serverEnv()).toMatchObject({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
  })

  it('rejects one Google variable without the other', () => {
    stubEnv({ ...valid, GOOGLE_CLIENT_ID: 'id' })
    expect(() => serverEnv()).toThrow(/Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/)
    resetServerEnv()
    stubEnv({ ...valid, GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_CLIENT_ID: '' })
    expect(() => serverEnv()).toThrow(/Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/)
  })
})

describe('assertAuthEnv', () => {
  const secret = 'k9Zr2Qv7mWx4Bn8Lp3Tc6Yd1Fh5Gj0AsEu7NiOq2'
  const url = 'https://example.com'

  it('passes for a long random secret and an absolute URL', () => {
    expect(secret).toHaveLength(40)
    expect(() => assertAuthEnv({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: url })).not.toThrow()
  })

  it('rejects a missing, short or placeholder secret', () => {
    expect(() => assertAuthEnv({ BETTER_AUTH_URL: url })).toThrow(/BETTER_AUTH_SECRET is required/)
    expect(() => assertAuthEnv({ BETTER_AUTH_SECRET: '', BETTER_AUTH_URL: url })).toThrow(
      /BETTER_AUTH_SECRET is required/,
    )
    expect(() =>
      assertAuthEnv({ BETTER_AUTH_SECRET: secret.slice(0, 31), BETTER_AUTH_URL: url }),
    ).toThrow(/BETTER_AUTH_SECRET must be at least 32 characters/)
    for (const placeholder of [
      'replace-with-a-32+-character-random-string',
      'build-only-placeholder-never-used-at-runtime',
    ]) {
      expect(() =>
        assertAuthEnv({ BETTER_AUTH_SECRET: placeholder, BETTER_AUTH_URL: url }),
      ).toThrow(/BETTER_AUTH_SECRET is a placeholder value; generate one with/)
    }
  })

  it('rejects a missing or non-absolute BETTER_AUTH_URL', () => {
    expect(() => assertAuthEnv({ BETTER_AUTH_SECRET: secret })).toThrow(
      /BETTER_AUTH_URL must be an absolute URL/,
    )
    expect(() =>
      assertAuthEnv({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'localhost:3000' }),
    ).toThrow(/BETTER_AUTH_URL must be an absolute URL/)
  })

  it('lists both problems in one message', () => {
    expect(() => assertAuthEnv({})).toThrow(
      /BETTER_AUTH_SECRET is required[\s\S]*BETTER_AUTH_URL must be an absolute URL/,
    )
  })
})
