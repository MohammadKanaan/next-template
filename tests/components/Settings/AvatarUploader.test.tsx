import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import { uploadFile } from '@/lib/client/uploads'
import type { CurrentUser } from '@/lib/dto/users'

vi.mock('@/lib/client/uploads', () => ({ uploadFile: vi.fn(async () => {}) }))

const ticket = {
  key: 'avatars/u1/upload-1',
  url: 'https://acct.r2.cloudflarestorage.com/bucket/k?X-Amz-Signature=s',
  headers: { 'Content-Type': 'image/png' },
}
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

  it('asks for a ticket, uploads to storage, then attaches and reports the user', async () => {
    const { onCreateUpload, onAttach, onUploaded } = setup()
    const file = png(1234)
    await choose(file)

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(user))
    expect(onCreateUpload).toHaveBeenCalledWith({
      purpose: 'avatar',
      contentType: 'image/png',
      size: 1234,
    })
    expect(uploadFile).toHaveBeenCalledWith(ticket, file)
    expect(onAttach).toHaveBeenCalledWith('avatars/u1/upload-1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
