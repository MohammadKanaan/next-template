// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleDeleteObject } from '@/jobs/deleteObject'
import { deleteObject } from '@/lib/server/storage'

vi.mock('@/lib/server/storage', () => ({ deleteObject: vi.fn(async () => {}) }))

describe('delete-object job', () => {
  afterEach(() => {
    vi.mocked(deleteObject).mockClear()
  })

  it('deletes the object under the payload key', async () => {
    await handleDeleteObject({ key: 'avatars/user/abc' })
    expect(deleteObject).toHaveBeenCalledWith('avatars/user/abc')
  })

  it('re-validates the payload', async () => {
    await expect(handleDeleteObject({ key: '' })).rejects.toThrow()
    await expect(handleDeleteObject(null)).rejects.toThrow()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('lets a storage failure propagate so pg-boss retries', async () => {
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error('storage down'))
    await expect(handleDeleteObject({ key: 'avatars/user/abc' })).rejects.toThrow('storage down')
  })
})
