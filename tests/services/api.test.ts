import { AxiosError, CanceledError, type AxiosResponse } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import API from '@/services/api'

class TestApi extends API {
  static instance() {
    return this.axiosInstance
  }
  static callGet<T>(url: string) {
    return this.get<T>(url)
  }
}

function axiosFailure(status: number, data: unknown) {
  const response = { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, null, response)
}

describe('API.makeRequest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('wraps success payloads', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockResolvedValue({ status: 201, data: { id: 1 } })
    await expect(TestApi.callGet('/posts')).resolves.toEqual({
      success: true,
      status: 201,
      message: 'Request successful',
      data: { id: 1 },
    })
  })

  it('formats validation errors and keeps them per field', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(
      axiosFailure(422, { message: 'Validation failed', errors: { title: ['Title is required'] } }),
    )
    await expect(TestApi.callGet('/posts')).resolves.toEqual({
      success: false,
      status: 422,
      message: 'title: Title is required',
      data: null,
      errors: { title: ['Title is required'] },
    })
  })

  it('uses the server message when there are no field errors', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(
      axiosFailure(403, { message: 'You cannot edit this post' }),
    )
    const response = await TestApi.callGet('/posts/1')
    expect(response).toMatchObject({ success: false, status: 403 })
    expect(response.message).toBe('You cannot edit this post')
  })

  it('maps cancellations to 499', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(new CanceledError())
    await expect(TestApi.callGet('/posts')).resolves.toMatchObject({ success: false, status: 499 })
  })

  it('maps network failures to 500 with the transport message', async () => {
    vi.spyOn(TestApi.instance(), 'request').mockRejectedValue(new AxiosError('Network Error'))
    await expect(TestApi.callGet('/posts')).resolves.toMatchObject({
      success: false,
      status: 500,
      message: 'Network Error',
    })
  })
})
