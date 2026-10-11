// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCleanup } from '@/jobs/cleanup'
import { deleteExpiredAuthRows, deleteStalePendingUploads } from '@/lib/data/maintenance'

const log = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => log } }))
vi.mock('@/lib/data/maintenance', () => ({
  deleteExpiredAuthRows: vi.fn(async () => ({ sessions: 2, verifications: 1 })),
  deleteStalePendingUploads: vi.fn(async () => ({ uploads: 3 })),
}))

describe('cleanup job', () => {
  afterEach(() => vi.restoreAllMocks())

  it('deletes expired auth rows and stale uploads, and logs the counts', async () => {
    await handleCleanup({})
    expect(deleteExpiredAuthRows).toHaveBeenCalledTimes(1)
    expect(deleteStalePendingUploads).toHaveBeenCalledTimes(1)
    expect(log.info).toHaveBeenCalledWith(
      { sessions: 2, verifications: 1, uploads: 3 },
      expect.any(String),
    )
  })

  it('re-validates the payload', async () => {
    vi.mocked(deleteExpiredAuthRows).mockClear()
    vi.mocked(deleteStalePendingUploads).mockClear()
    await expect(handleCleanup('nope')).rejects.toThrow()
    expect(deleteExpiredAuthRows).not.toHaveBeenCalled()
    expect(deleteStalePendingUploads).not.toHaveBeenCalled()
  })
})
