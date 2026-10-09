// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestError } from '@/lib/client/errors'
import { uploadFile } from '@/lib/client/uploads'

const ticket = {
  uploadId: 'id',
  url: 'https://acct.r2.cloudflarestorage.com/bucket/avatars/u/1?X-Amz-Signature=s',
  headers: { 'Content-Type': 'image/png' },
}
const file = new File(['png'], 'me.png', { type: 'image/png' })

describe('uploadFile', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PUTs the file to the ticket URL with the signed headers', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await uploadFile(ticket, file)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ticket.url)
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ 'Content-Type': 'image/png' })
    expect(init.body).toBe(file)
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
