// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCleanup } from '@/jobs/cleanup'
import { deleteExpiredAuthRows } from '@/lib/data/maintenance'

const log = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => log } }))
vi.mock('@/lib/data/maintenance', () => ({
  deleteExpiredAuthRows: vi.fn(async () => ({ sessions: 2, verifications: 1 })),
}))

describe('cleanup job', () => {
  afterEach(() => vi.restoreAllMocks())

  it('re-validates the payload', async () => {
    vi.mocked(deleteExpiredAuthRows).mockClear()
    await expect(handleCleanup('nope')).rejects.toThrow()
    expect(deleteExpiredAuthRows).not.toHaveBeenCalled()
  })
})
