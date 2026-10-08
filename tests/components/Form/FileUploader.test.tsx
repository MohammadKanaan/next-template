import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileUploader } from '@/components/Form/FileUploader'

const pdf = (name = 'a.pdf', size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' })

const setup = (props: Partial<React.ComponentProps<typeof FileUploader>> = {}) => {
  const onUpload = vi.fn(async () => {})
  render(
    <FileUploader
      label="Add files"
      accept={['application/pdf', 'image/png']}
      maxSize={100}
      multiple
      onUpload={onUpload}
      {...props}
    />,
  )
  return { onUpload, input: screen.getByLabelText('Add files') }
}

describe('FileUploader', () => {
  it('takes accept and multiple from its props', () => {
    const { input } = setup({ hint: 'PDF or PNG' })
    expect(input).toHaveAttribute('accept', 'application/pdf,image/png')
    expect(input).toHaveAttribute('multiple')
    expect(screen.getByText('PDF or PNG')).toBeInTheDocument()
  })

  it('uploads every picked file in order and shows each as uploaded', async () => {
    const order: string[] = []
    const { input } = setup({
      onUpload: vi.fn(async (file: File) => {
        order.push(`start ${file.name}`)
        await Promise.resolve()
        order.push(`end ${file.name}`)
      }),
    })
    await userEvent.upload(input, [pdf('a.pdf'), pdf('b.pdf')])

    await waitFor(() => expect(screen.getAllByText('Uploaded')).toHaveLength(2))
    expect(order).toEqual(['start a.pdf', 'end a.pdf', 'start b.pdf', 'end b.pdf'])
  })

  it('refuses the files beyond maxFiles without sending them, and counts only acceptable ones', async () => {
    const names: string[] = []
    const { input } = setup({
      maxFiles: 2,
      onUpload: vi.fn(async (file: File) => {
        names.push(file.name)
      }),
    })
    const bad = new File([new Uint8Array(10)], 'bad.txt', { type: 'text/plain' })
    await userEvent.upload(input, [bad, pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')], {
      applyAccept: false,
    })

    await waitFor(() => expect(screen.getAllByText('Uploaded')).toHaveLength(2))
    expect(names).toEqual(['a.pdf', 'b.pdf'])
    expect(screen.getByText('bad.txt is not an allowed file type')).toBeInTheDocument()
    expect(screen.getByText('c.pdf was not uploaded: no room left')).toBeInTheDocument()
  })

  it('shows an inline error per file and carries on with the rest', async () => {
    const onUpload = vi.fn(async (file: File) => {
      if (file.name === 'bad.pdf') {
        throw new Error('The upload was rejected')
      }
    })
    const { input } = setup({ onUpload })
    await userEvent.upload(input, [pdf('bad.pdf'), pdf('good.pdf')])

    expect(await screen.findByText('The upload was rejected')).toBeInTheDocument()
    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
    expect(onUpload).toHaveBeenCalledTimes(2)
  })

  it('rejects a wrong type, an empty file and an oversized file without calling onUpload', async () => {
    const { input, onUpload } = setup({ accept: ['application/pdf'] })
    await userEvent.upload(
      input,
      [new File(['x'], 'a.png', { type: 'image/png' }), pdf('empty.pdf', 0), pdf('big.pdf', 101)],
      { applyAccept: false },
    )

    expect(await screen.findByText('a.png is not an allowed file type')).toBeInTheDocument()
    expect(screen.getByText('empty.pdf is empty')).toBeInTheDocument()
    expect(screen.getByText('big.pdf is larger than 100 B')).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('is disabled when told so', () => {
    const { input } = setup({ disabled: true })
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add files' })).toBeDisabled()
  })

  it('lets the same file be picked again after a failure', async () => {
    const onUpload = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue(undefined)
    const { input } = setup({ onUpload })
    const file = pdf()
    await userEvent.upload(input, file)
    await screen.findByText('nope')
    await userEvent.upload(input, file)
    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
    expect(onUpload).toHaveBeenCalledTimes(2)
  })
})
