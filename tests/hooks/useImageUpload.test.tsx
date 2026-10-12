import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageUpload } from '@/hooks/useImageUpload'
import { uploadFile } from '@/lib/client/uploads'

vi.mock('@/lib/client/uploads', () => ({ uploadFile: vi.fn() }))

const ticket = { key: 'avatars/u/1', url: 'https://storage.test/k', headers: {} }

const png = (size = 3) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' })

/** A change event as the file input sends it; `target.value` is what the hook clears. */
const changeTo = (file: File) => {
  const target = { files: [file], value: 'C:\\fakepath\\a.png' }
  return { event: { target } as unknown as ChangeEvent<HTMLInputElement>, target }
}

const setup = () => {
  const createUpload = vi.fn().mockResolvedValue({ ok: true, data: ticket })
  const attach = vi.fn().mockResolvedValue({ ok: true, data: 'attached' })
  const onAttached = vi.fn()
  const { result } = renderHook(() =>
    useImageUpload({ purpose: 'avatar', createUpload, attach, onAttached }),
  )
  return { result, createUpload, attach, onAttached }
}

describe('useImageUpload', () => {
  beforeEach(() => {
    vi.mocked(uploadFile).mockReset().mockResolvedValue()
  })

  it('checks, asks for a ticket, uploads, attaches the key and clears the input', async () => {
    const { result, createUpload, attach, onAttached } = setup()
    const file = png(10)
    const { event, target } = changeTo(file)
    await act(async () => result.current.handleChange(event))

    expect(target.value).toBe('')
    expect(createUpload).toHaveBeenCalledWith({
      purpose: 'avatar',
      contentType: 'image/png',
      size: 10,
    })
    expect(uploadFile).toHaveBeenCalledWith(ticket, file)
    expect(attach).toHaveBeenCalledWith('avatars/u/1')
    expect(onAttached).toHaveBeenCalledWith('attached')
    expect(result.current).toMatchObject({ error: null, uploading: false })
  })

  it('refuses a file the rule does not allow before asking for a ticket', async () => {
    const { result, createUpload } = setup()
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' })
    await act(async () => result.current.handleChange(changeTo(gif).event))

    expect(result.current.error).toBe('Use a PNG, JPEG, or WebP image')
    expect(createUpload).not.toHaveBeenCalled()
  })

  it('reports a refused attach and does not call onAttached', async () => {
    const { result, attach, onAttached } = setup()
    attach.mockResolvedValue({ ok: false, code: 'VALIDATION', message: 'Invalid upload' })
    await act(async () => result.current.handleChange(changeTo(png()).event))

    expect(result.current).toMatchObject({ error: 'Invalid upload', uploading: false })
    expect(onAttached).not.toHaveBeenCalled()
  })

  it('reports a storage failure with a fallback for non-errors', async () => {
    const { result, attach } = setup()
    vi.mocked(uploadFile).mockRejectedValue('boom')
    await act(async () => result.current.handleChange(changeTo(png()).event))

    expect(result.current.error).toBe('The upload failed. Try again.')
    expect(attach).not.toHaveBeenCalled()
  })
})
