// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestError } from '@/lib/client/errors'
import { uploadFile } from '@/lib/client/uploads'

const ticket = {
  uploadId: 'id',
  url: 'http://storage.test/bucket',
  fields: { key: 'avatars/u/1', 'Content-Type': 'image/png', Policy: 'p' },
}
const file = new File(['png'], 'me.png', { type: 'image/png' })

describe('uploadFile', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs the policy fields first and the file last, to the ticket URL', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await uploadFile(ticket, file)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ticket.url)
    expect(init.method).toBe('POST')
    const names = [...(init.body as FormData).keys()]
    expect(names).toEqual(['key', 'Content-Type', 'Policy', 'file'])
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('throws a RequestError when storage refuses the file', async () => {
    vi.stubGlobal('fetch', async () => new Response('<Error/>', { status: 403 }))
    const error = await uploadFile(ticket, file).catch((caught) => caught)
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status: 403, message: 'The upload was rejected' })
  })

  it('reports a storage outage as retryable', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }))
    await expect(uploadFile(ticket, file)).rejects.toMatchObject({
      status: 503,
      message: 'The upload failed. Try again.',
    })
  })
})
