// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCleanup } from '@/jobs/cleanup'
import {
  deleteExpiredAuthRows,
  deleteStalePendingUploads,
  purgeDeletedPosts,
} from '@/lib/data/maintenance'

const log = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => log } }))
vi.mock('@/lib/data/maintenance', () => ({
  deleteExpiredAuthRows: vi.fn(async () => ({ sessions: 2, verifications: 1 })),
  deleteStalePendingUploads: vi.fn(async () => ({ uploads: 3 })),
  purgeDeletedPosts: vi.fn(async () => ({ posts: 4 })),
}))

describe('cleanup job', () => {
  afterEach(() => vi.restoreAllMocks())

  it('deletes expired auth rows and logs the counts', async () => {
    await handleCleanup({})
    expect(deleteExpiredAuthRows).toHaveBeenCalledTimes(1)
    expect(deleteStalePendingUploads).toHaveBeenCalledTimes(1)
    expect(purgeDeletedPosts).toHaveBeenCalledTimes(1)
    expect(log.info).toHaveBeenCalledWith(
      { sessions: 2, verifications: 1, uploads: 3, posts: 4 },
      expect.any(String),
    )
  })

  it('re-validates the payload', async () => {
    vi.mocked(deleteExpiredAuthRows).mockClear()
    vi.mocked(deleteStalePendingUploads).mockClear()
    vi.mocked(purgeDeletedPosts).mockClear()
    await expect(handleCleanup('nope')).rejects.toThrow()
    expect(deleteExpiredAuthRows).not.toHaveBeenCalled()
    expect(deleteStalePendingUploads).not.toHaveBeenCalled()
    expect(purgeDeletedPosts).not.toHaveBeenCalled()
  })
})
