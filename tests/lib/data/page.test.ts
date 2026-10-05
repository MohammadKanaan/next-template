// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/data/errors'
import { loadPage } from '@/lib/data/page'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

describe('loadPage', () => {
  it('returns the loaded value', async () => {
    expect(await loadPage(async () => 42, '/x')).toBe(42)
  })

  it('redirects signed-out users to login with the page as next', async () => {
    await expect(
      loadPage(async () => {
        throw new UnauthorizedError()
      }, '/posts/new'),
    ).rejects.toThrow('REDIRECT /login?next=%2Fposts%2Fnew')
  })

  it('renders not-found for missing records', async () => {
    await expect(
      loadPage(async () => {
        throw new NotFoundError()
      }, '/x'),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('lets other errors through', async () => {
    const error = new ForbiddenError()
    await expect(
      loadPage(async () => {
        throw error
      }, '/x'),
    ).rejects.toBe(error)
  })
})
