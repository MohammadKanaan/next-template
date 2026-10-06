import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import { RequestError } from '@/lib/client/posts'
import { uploadFile } from '@/lib/client/uploads'
import type { CurrentUser } from '@/lib/dto/users'

vi.mock('@/lib/client/uploads', () => ({ uploadFile: vi.fn(async () => {}) }))

const ticket = { uploadId: 'upload-1', url: 'http://storage.test/bucket', fields: { key: 'k' } }
const user: CurrentUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  image: 'http://storage.test/bucket/avatars/u1/x',
  website: null,
  role: 'user',
}

const setup = () => {
  const onCreateUpload = vi.fn().mockResolvedValue({ ok: true, data: ticket })
  const onAttach = vi.fn().mockResolvedValue({ ok: true, data: user })
  const onUploaded = vi.fn()
  render(
    <AvatarUploader
      name="Ada Lovelace"
      image={null}
      onCreateUpload={onCreateUpload}
      onAttach={onAttach}
      onUploaded={onUploaded}
    />,
  )
  return { onCreateUpload, onAttach, onUploaded }
}

const png = (size = 3) => new File([new Uint8Array(size)], 'me.png', { type: 'image/png' })
const choose = (file: File) => userEvent.upload(screen.getByLabelText('Profile photo'), file)

describe('AvatarUploader', () => {
  beforeEach(() => {
    vi.mocked(uploadFile).mockReset().mockResolvedValue()
  })

  it('shows initials when there is no image', () => {
    setup()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('asks for a ticket, uploads to storage, then attaches and reports the user', async () => {
    const { onCreateUpload, onAttach, onUploaded } = setup()
    const file = png(1234)
    await choose(file)

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(user))
    expect(onCreateUpload).toHaveBeenCalledWith({ contentType: 'image/png', size: 1234 })
    expect(uploadFile).toHaveBeenCalledWith(ticket, file)
    expect(onAttach).toHaveBeenCalledWith('upload-1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects an unsupported type without calling the server', async () => {
    const { onCreateUpload } = setup()
    // `userEvent.upload` honours `accept`, so bypass it to prove the check is ours.
    const input = screen.getByLabelText('Profile photo')
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, new File(['x'], 'a.gif', { type: 'image/gif' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Use a PNG, JPEG, or WebP image')
    expect(onCreateUpload).not.toHaveBeenCalled()
  })

  it('rejects a file over 2 MB without calling the server', async () => {
    const { onCreateUpload } = setup()
    await choose(png(2 * 1024 * 1024 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent('2 MB or smaller')
    expect(onCreateUpload).not.toHaveBeenCalled()
  })

  it('shows the server message when the ticket is refused', async () => {
    const { onCreateUpload, onAttach } = setup()
    onCreateUpload.mockResolvedValue({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue',
    })
    await choose(png())
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to continue')
    expect(uploadFile).not.toHaveBeenCalled()
    expect(onAttach).not.toHaveBeenCalled()
  })

  it('shows the storage failure and does not attach', async () => {
    const { onAttach, onUploaded } = setup()
    vi.mocked(uploadFile).mockRejectedValue(new RequestError('The upload was rejected', 403))
    await choose(png())
    expect(await screen.findByRole('alert')).toHaveTextContent('The upload was rejected')
    expect(onAttach).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('shows the server message when attaching fails', async () => {
    const { onAttach, onUploaded } = setup()
    onAttach.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
    })
    await choose(png())
    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed')
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('disables the picker and shows progress while uploading', async () => {
    const { onCreateUpload } = setup()
    let release: (value: unknown) => void = () => {}
    onCreateUpload.mockReturnValue(new Promise((resolve) => (release = resolve)))
    await choose(png())

    const button = screen.getByRole('button', { name: 'Change photo' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Profile photo')).toBeDisabled()

    release({ ok: false, code: 'UNAUTHORIZED', message: 'Sign in to continue' })
    await waitFor(() => expect(button).toBeEnabled())
  })
})
