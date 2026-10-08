import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { RequestError } from '@/lib/client/errors'
import { getJson } from '@/lib/client/getJson'

const schema = z.object({ n: z.coerce.number() })

describe('getJson', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends only the defined, non-empty query keys and parses the body with the schema', async () => {
    const fetchMock = vi.fn(async () => Response.json({ n: '3' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await getJson(
      '/things',
      { page: 2, q: '', cursor: undefined, tag: null, flag: false },
      schema,
    )
    expect(result).toEqual({ n: 3 })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toMatch(/\/things\?page=2&flag=false$/)
  })

  it('throws a RequestError with the body message and the status', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ message: 'Nope' }, { status: 403 }))
    await expect(getJson('/things', {}, schema)).rejects.toMatchObject({
      message: 'Nope',
      status: 403,
    })
  })

  it('names the status when the answer is not the app error body (a proxy 502)', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await getJson('/things', {}, schema).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ message: 'Request failed (502)', status: 502 })
  })
})
