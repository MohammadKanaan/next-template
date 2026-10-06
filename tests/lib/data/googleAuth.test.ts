// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signUpInput } from '@/lib/dto/auth'

const { cookieStore, requestHeaders } = await vi.hoisted(
  async () => import('../../helpers/cookies'),
)
vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))

// The Better Auth config is built when `lib/data/auth` is imported, so each case sets the
// environment first and imports a fresh copy. Nothing here reaches Google: building the
// authorization URL is local, and the callback (the real round trip) is not exercised.
const loadAuth = async (env: { id?: string; secret?: string }) => {
  vi.resetModules()
  vi.stubEnv('GOOGLE_CLIENT_ID', env.id)
  vi.stubEnv('GOOGLE_CLIENT_SECRET', env.secret)
  return import('@/lib/data/auth')
}

describe('Google provider', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is off without the variables', async () => {
    const { auth, isGoogleAuthEnabled } = await loadAuth({})
    expect(isGoogleAuthEnabled()).toBe(false)
    expect(auth.options.socialProviders?.google).toBeUndefined()
  })

  it('is off when only one variable is set, or when they are empty', async () => {
    expect((await loadAuth({ id: 'id' })).isGoogleAuthEnabled()).toBe(false)
    expect((await loadAuth({ secret: 'secret' })).isGoogleAuthEnabled()).toBe(false)
    expect((await loadAuth({ id: '', secret: '' })).isGoogleAuthEnabled()).toBe(false)
  })

  it('is on with both variables', async () => {
    const { auth, isGoogleAuthEnabled } = await loadAuth({ id: 'id', secret: 'secret' })
    expect(isGoogleAuthEnabled()).toBe(true)
    expect(auth.options.socialProviders?.google).toMatchObject({
      clientId: 'id',
      clientSecret: 'secret',
    })
  })

  it('maps a Google profile to a username the sign-up rule accepts', async () => {
    const { auth } = await loadAuth({ id: 'id', secret: 'secret' })
    const google = auth.options.socialProviders?.google
    const mapped = await google?.mapProfileToUser?.({ email: 'Ada.Lovelace@example.com' })
    expect(mapped).toEqual({ username: expect.stringMatching(/^ada_lovelace_[a-z0-9]{6}$/) })
    expect(signUpInput.shape.username.safeParse(mapped?.username).success).toBe(true)
    // A profile without an email still gets a valid username.
    const fallback = await google?.mapProfileToUser?.({})
    expect(signUpInput.shape.username.safeParse(fallback?.username).success).toBe(true)
  })

  it('keeps the OAuth routes reachable while the email sign-up path stays disabled', async () => {
    const { auth } = await loadAuth({ id: 'id', secret: 'secret' })
    const disabled = auth.options.disabledPaths ?? []
    expect(disabled).toContain('/sign-up/email')
    expect(disabled).not.toContain('/sign-in/social')
    expect(disabled.some((path) => path.includes('callback/google'))).toBe(false)
  })
})

describe('signInWithGoogleAction', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails normally when the provider is not configured', async () => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_CLIENT_ID', undefined)
    vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined)
    const { signInWithGoogleAction } = await import('@/actions/auth')
    expect(await signInWithGoogleAction('/posts')).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Google sign-in is not available.',
    })
  })

  it('redirects to Google with the sanitized return path when configured', async () => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    const { signInWithGoogleAction } = await import('@/actions/auth')
    const error = await signInWithGoogleAction('/posts/mine').catch((caught: unknown) => caught)
    // Next's redirect() throws; the action must not swallow it into an ActionResult.
    expect(error).toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) })
    const digest = (error as { digest: string }).digest
    const url = new URL(digest.split(';')[2])
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe('client-id.apps.googleusercontent.com')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/google',
    )
  })

  it('stores the sanitized return path in the OAuth state', async () => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    const { signInWithGoogleAction } = await import('@/actions/auth')
    const { db } = await import('@/lib/data/db')
    const { resetDatabase } = await import('../../helpers/server')
    const callbackFor = async (nextPath: string) => {
      await resetDatabase()
      await signInWithGoogleAction(nextPath).catch(() => null)
      const row = await db.verification.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
      return JSON.parse(row.value).callbackURL
    }
    expect(await callbackFor('/posts/mine')).toBe('/posts/mine')
    // A hostile value falls back to the default instead of sending the user off-site.
    expect(await callbackFor('//evil.example')).toBe('/dashboard')
    expect(await callbackFor('https://evil.example')).toBe('/dashboard')
    await db.$disconnect()
  })
})
