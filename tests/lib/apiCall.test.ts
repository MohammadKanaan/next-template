import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mFetch, sData, sFetch } from '@/lib/apiCall'
import type { ApiResponse } from '@/types/api'

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

const ok = <T>(data: T): ApiResponse<T> => ({ success: true, status: 200, message: 'ok', data })
const failed = (message: string): ApiResponse<never> => ({
  success: false,
  status: 422,
  message,
  data: null,
})

describe('apiCall helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('toggles loading around a successful request', async () => {
    const states: boolean[] = []
    const response = await sFetch(async () => ok(1), { loading: (value) => states.push(value) })
    expect(response.data).toBe(1)
    expect(states).toEqual([true, false])
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('toasts and throws on failure by default', async () => {
    await expect(sFetch(async () => failed('Nope'))).rejects.toThrow('Nope')
    expect(toastMock.error).toHaveBeenCalledWith('Nope')
  })

  it('returns the failure quietly when asked', async () => {
    const response = await sFetch(async () => failed('Nope'), {
      toast: false,
      throwOnError: false,
    })
    expect(response).toMatchObject({ success: false, message: 'Nope', data: null })
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('humanizes transport errors', async () => {
    await expect(
      sFetch(async () => failed('Network Error'), { throwOnError: false }),
    ).resolves.toMatchObject({ message: 'Connection problem. Check your internet connection.' })
  })

  it('returns data directly with sData', async () => {
    await expect(sData(async () => ok({ id: 7 }))).resolves.toEqual({ id: 7 })
  })

  it('toasts once for a batch in first mode', async () => {
    await mFetch([async () => failed('A'), async () => failed('B')], {
      toastMode: 'first',
      throwOnError: false,
    })
    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith('A')
  })
})
