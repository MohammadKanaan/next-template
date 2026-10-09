// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertAuthEnv, R2_VARIABLES, resetServerEnv, serverEnv } from '@/lib/server/env'

const valid = {
  REDIS_URL: 'redis://localhost:6379/15',
  EMAIL_FROM: 'App <noreply@example.com>',
}

const stubEnv = (values: Record<string, string | undefined>) => {
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: undefined,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    TRUSTED_PROXY_HOPS: undefined,
    ...Object.fromEntries(R2_VARIABLES.map((name) => [name, undefined])),
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
    stubEnv({ ...valid, RESEND_API_KEY: '' })
    expect(serverEnv().RESEND_API_KEY).toBeUndefined()
  })

  it('memoizes the first successful parse', () => {
    stubEnv(valid)
    const first = serverEnv()
    stubEnv({ ...valid, REDIS_URL: 'redis://elsewhere' })
    expect(serverEnv()).toBe(first)
  })

  it('lists every missing or invalid variable in one error', () => {
    stubEnv({ ...valid, REDIS_URL: undefined, EMAIL_FROM: '' })
    expect(() => serverEnv()).toThrow(/REDIS_URL[\s\S]*EMAIL_FROM/)
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

describe('serverEnv R2 group', () => {
  const r2 = {
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'bucket',
    R2_PUBLIC_URL: 'https://pub-abc.r2.dev',
  }
  beforeEach(resetServerEnv)
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
  })

  it('is optional as a whole, and empty values count as unset', () => {
    stubEnv(valid)
    expect(serverEnv().R2_BUCKET).toBeUndefined()
    resetServerEnv()
    stubEnv({ ...valid, ...Object.fromEntries(R2_VARIABLES.map((name) => [name, ''])) })
    expect(serverEnv().R2_ACCOUNT_ID).toBeUndefined()
  })

  it('accepts all five together', () => {
    stubEnv({ ...valid, ...r2 })
    expect(serverEnv()).toMatchObject(r2)
  })

  it('rejects a partial group, naming every variable', () => {
    stubEnv({ ...valid, ...r2, R2_PUBLIC_URL: undefined })
    expect(() => serverEnv()).toThrow(
      /Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL together, or none/,
    )
  })

  it('requires R2_PUBLIC_URL to be a URL', () => {
    stubEnv({ ...valid, ...r2, R2_PUBLIC_URL: 'pub-abc.r2.dev' })
    expect(() => serverEnv()).toThrow(/R2_PUBLIC_URL/)
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
