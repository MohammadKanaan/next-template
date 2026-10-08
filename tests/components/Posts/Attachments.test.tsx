import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostAttachments } from '@/components/Posts/Attachments'
import { PostAttachmentList } from '@/components/Posts/AttachmentList'
import { uploadFile } from '@/lib/client/uploads'
import { POST_ATTACHMENTS_MAX, type Attachment } from '@/lib/dto/uploads'

vi.mock('@/lib/client/uploads', () => ({ uploadFile: vi.fn(async () => {}) }))

const ticket = { uploadId: 'upload-1', url: 'http://storage.test/bucket', fields: { key: 'k' } }

const attachment = (n: number): Attachment => ({
  id: `id-${n}`,
  name: `file-${n}.pdf`,
  url: `http://storage.test/bucket/attachments/u/${n}`,
  contentType: 'application/pdf',
  size: 1536,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
})

const pdf = (name = 'report.pdf', size = 2048) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' })

const setup = (attachments: Attachment[] = []) => {
  const onCreateUpload = vi.fn().mockResolvedValue({ ok: true, data: ticket })
  const onAttach = vi.fn().mockResolvedValue({ ok: true, data: attachment(9) })
  const onDetach = vi.fn().mockResolvedValue({ ok: true, data: null })
  render(
    <PostAttachments
      postId={7}
      attachments={attachments}
      onCreateUpload={onCreateUpload}
      onAttach={onAttach}
      onDetach={onDetach}
    />,
  )
  return { onCreateUpload, onAttach, onDetach }
}

describe('PostAttachments', () => {
  beforeEach(() => {
    vi.mocked(uploadFile).mockReset().mockResolvedValue()
  })

  it('lists the files as links with their size, or says there are none', () => {
    setup([attachment(1)])
    const link = screen.getByRole('link', { name: 'file-1.pdf' })
    expect(link).toHaveAttribute('href', 'http://storage.test/bucket/attachments/u/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('1.5 KB')).toBeInTheDocument()
  })

  it('says so when there are no attachments', () => {
    setup()
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument()
  })

  it('asks for a ticket for the post, uploads, attaches and adds the file to the list', async () => {
    const { onCreateUpload, onAttach } = setup()
    const file = pdf('report.pdf', 2048)
    await userEvent.upload(screen.getByLabelText('Add files'), file)

    expect(await screen.findByRole('link', { name: 'file-9.pdf' })).toBeInTheDocument()
    expect(onCreateUpload).toHaveBeenCalledWith({
      purpose: 'attachment',
      contentType: 'application/pdf',
      size: 2048,
      name: 'report.pdf',
      postId: 7,
    })
    expect(uploadFile).toHaveBeenCalledWith(ticket, file)
    expect(onAttach).toHaveBeenCalledWith('upload-1')
    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
    expect(screen.queryByText('No attachments yet.')).not.toBeInTheDocument()
  })

  it('refuses the files beyond the free slots before uploading them', async () => {
    const { onCreateUpload, onAttach } = setup(
      Array.from({ length: POST_ATTACHMENTS_MAX - 2 }, (_, n) => attachment(n)),
    )
    const files = ['a', 'b', 'c', 'd'].map((name) => pdf(`${name}.pdf`))
    await userEvent.upload(screen.getByLabelText('Add files'), files)

    await waitFor(() => expect(screen.getAllByText('Uploaded')).toHaveLength(2))
    expect(onCreateUpload).toHaveBeenCalledTimes(2)
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(onAttach).toHaveBeenCalledTimes(2)
    expect(screen.getByText('c.pdf was not uploaded: no room left')).toBeInTheDocument()
    expect(screen.getByText('d.pdf was not uploaded: no room left')).toBeInTheDocument()
  })

  it('shows the server message beside the file when the ticket is refused', async () => {
    const { onCreateUpload, onAttach } = setup()
    onCreateUpload.mockResolvedValue({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many uploads',
    })
    await userEvent.upload(screen.getByLabelText('Add files'), pdf())

    expect(await screen.findByText('Too many uploads')).toBeInTheDocument()
    expect(uploadFile).not.toHaveBeenCalled()
    expect(onAttach).not.toHaveBeenCalled()
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument()
  })

  it('shows the storage error and the attach error', async () => {
    const { onAttach } = setup()
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error('The upload was rejected'))
    await userEvent.upload(screen.getByLabelText('Add files'), pdf('a.pdf'))
    expect(await screen.findByText('The upload was rejected')).toBeInTheDocument()
    expect(onAttach).not.toHaveBeenCalled()

    onAttach.mockResolvedValue({ ok: false, code: 'VALIDATION', message: 'At most 10 attachments' })
    await userEvent.upload(screen.getByLabelText('Add files'), pdf('b.pdf'))
    expect(await screen.findByText('At most 10 attachments')).toBeInTheDocument()
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument()
  })

  it('removes an attachment from the list', async () => {
    const { onDetach } = setup([attachment(1), attachment(2)])
    await userEvent.click(screen.getByRole('button', { name: 'Remove file-2.pdf' }))
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'file-2.pdf' })).not.toBeInTheDocument(),
    )
    expect(onDetach).toHaveBeenCalledWith('id-2')
    expect(screen.getByRole('link', { name: 'file-1.pdf' })).toBeInTheDocument()
  })

  it('shows a failed removal', async () => {
    const { onDetach } = setup([attachment(1)])
    onDetach.mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'Attachment not found' })
    await userEvent.click(screen.getByRole('button', { name: 'Remove file-1.pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Attachment not found')
    expect(screen.getByRole('link', { name: 'file-1.pdf' })).toBeInTheDocument()
  })

  it('turns the uploader off at the maximum', () => {
    setup(Array.from({ length: POST_ATTACHMENTS_MAX }, (_, n) => attachment(n)))
    expect(screen.getByLabelText('Add files')).toBeDisabled()
    expect(screen.getByText(/at most 10 attachments/)).toBeInTheDocument()
  })

  it('offers the types and size of the attachment rule', () => {
    setup()
    const accept = screen.getByLabelText('Add files').getAttribute('accept')
    expect(accept).toContain('application/pdf')
    expect(accept).toContain('text/csv')
    expect(accept).not.toContain('svg')
    expect(screen.getByText(/up to 10 MB each/)).toBeInTheDocument()
  })
})

describe('PostAttachmentList', () => {
  it('renders each attachment as a link with its size', () => {
    render(<PostAttachmentList attachments={[attachment(1), attachment(2)]} />)
    expect(screen.getByRole('list', { name: 'Attachments' })).toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'file-1.pdf',
      'file-2.pdf',
    ])
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('rel', 'noreferrer')
  })

  it('renders nothing without attachments', () => {
    const { container } = render(<PostAttachmentList attachments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
