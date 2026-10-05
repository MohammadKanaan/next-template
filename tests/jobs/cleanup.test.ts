// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCleanup } from '@/jobs/cleanup'
import { deleteExpiredAuthRows } from '@/lib/data/maintenance'

vi.mock('@/lib/data/maintenance', () => ({
  deleteExpiredAuthRows: vi.fn(async () => ({ sessions: 2, verifications: 1 })),
}))

describe('cleanup job', () => {
  afterEach(() => vi.restoreAllMocks())

  it('deletes expired auth rows and logs the counts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handleCleanup({})
    expect(deleteExpiredAuthRows).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2 expired sessions'))
  })

  it('re-validates the payload', async () => {
    vi.mocked(deleteExpiredAuthRows).mockClear()
    await expect(handleCleanup('nope')).rejects.toThrow()
    expect(deleteExpiredAuthRows).not.toHaveBeenCalled()
  })
})
