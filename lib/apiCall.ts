import { toast as sonner } from 'sonner'
import { humanizeErrorMessage } from '@/lib/errorMessage'
import type { ApiResponse } from '@/types/api'

/**
 * Small fetch helpers with consistent UX.
 *
 * Why this exists:
 * - keep loading toggling consistent
 * - keep toast error messaging in one place
 * - avoid repeating `if (!response.success)` everywhere
 *
 * Naming:
 * - `sFetch` / `sData` for single request
 * - `mFetch` / `mData` for multiple (parallel) requests
 *
 * These helpers expect your service methods to return `ApiResponse<T>`
 * (see `services/api.ts`). Presenters are never built here: callers build
 * them where the data is consumed.
 */

/** React callers pass a state setter, e.g. `{ loading: setIsLoading }`. */
export type LoadingTarget = (value: boolean) => void

export type ApiCallOptions = {
  loading?: LoadingTarget
  toast?: boolean
  toastColor?: 'default' | 'destructive' | 'success'
  fallbackErrorMessage?: string
  overrideErrorMessage?: string
  throwOnError?: boolean
}

export type ApiBatchOptions = ApiCallOptions & {
  toastMode?: 'first' | 'each' | 'none'
}

function setLoading(target: LoadingTarget | undefined, value: boolean) {
  target?.(value)
}

function toastError(
  message: string,
  variant: 'default' | 'destructive' | 'success' = 'destructive',
) {
  // Toasts are a browser concern; skip them while rendering on the server.
  if (typeof window === 'undefined') {
    return
  }
  if (variant === 'destructive') {
    sonner.error(message)
  } else if (variant === 'success') {
    sonner.success(message)
  } else {
    sonner(message)
  }
}

function resolveErrorMessage(
  baseMessage: string | undefined,
  options: Pick<ApiCallOptions, 'overrideErrorMessage' | 'fallbackErrorMessage'>,
) {
  return (
    options.overrideErrorMessage ||
    humanizeErrorMessage(baseMessage) ||
    options.fallbackErrorMessage ||
    'Request failed'
  )
}

/**
 * Single fetch that returns the whole `ApiResponse`.
 *
 * - If `throwOnError` is true (default), it throws on any non-success.
 * - If `toast` is true (default), it shows the resolved error message once.
 */
export async function sFetch<T>(
  request: () => Promise<ApiResponse<T>>,
  options: ApiCallOptions = {},
): Promise<ApiResponse<T>> {
  const { toast = true, toastColor = 'destructive', throwOnError = true, loading } = options

  setLoading(loading, true)

  try {
    let response: ApiResponse<T>

    try {
      response = await request()
    } catch (err) {
      const message = resolveErrorMessage(err instanceof Error ? err.message : undefined, options)

      if (toast) {
        toastError(message, toastColor)
      }
      if (throwOnError) {
        throw new Error(message, { cause: err })
      }
      return { success: false, status: 500, message, data: null }
    }

    if (response?.success) {
      return response
    }

    const message = resolveErrorMessage(response?.message, options)

    if (toast) {
      toastError(message, toastColor)
    }
    if (throwOnError) {
      throw new Error(message, { cause: response })
    }
    return { ...response, success: false, message, data: null }
  } finally {
    setLoading(loading, false)
  }
}

/**
 * Single fetch that returns `data` directly (throws on error).
 *
 * Use this when you want a clean happy-path:
 * `const profile = await sData(() => MeService.getProfile(), { loading })`
 */
export async function sData<T>(
  request: () => Promise<ApiResponse<T>>,
  options: Omit<ApiCallOptions, 'throwOnError'> = {},
): Promise<T> {
  const response = await sFetch(request, {
    ...options,
    throwOnError: true,
  })

  return response.data as T
}

/**
 * Multiple fetches in parallel.
 *
 * Toast behavior:
 * - `toastMode: 'each'` (default): toast each failing request
 * - `toastMode: 'first'`: show a single toast for the first failure
 * - `toastMode: 'none'`: never toast
 */
export async function mFetch<T extends readonly unknown[]>(
  requests: { [K in keyof T]: () => Promise<ApiResponse<T[K]>> },
  options: ApiBatchOptions = {},
): Promise<{ [K in keyof T]: ApiResponse<T[K]> }> {
  const {
    loading,
    toast = true,
    toastColor = 'destructive',
    throwOnError = true,
    toastMode = 'each',
  } = options

  setLoading(loading, true)

  try {
    const perRequestToast = toastMode === 'each' ? toast : false
    const allowToast = toast && toastMode !== 'none'

    const results = await Promise.all(
      requests.map((req) =>
        sFetch(req, {
          ...options,
          loading: undefined,
          toast: perRequestToast,
          throwOnError: false,
        }),
      ),
    )

    const firstFailure = results.find((response) => !response?.success)
    if (!firstFailure) {
      return results as { [K in keyof T]: ApiResponse<T[K]> }
    }

    const message = resolveErrorMessage(firstFailure.message, options)

    if (allowToast && toastMode === 'first') {
      toastError(message, toastColor)
    }

    if (throwOnError) {
      throw new Error(message)
    }

    return results as { [K in keyof T]: ApiResponse<T[K]> }
  } finally {
    setLoading(loading, false)
  }
}

/**
 * Multiple fetches in parallel that returns only the `data` tuple.
 * Throws if any request fails.
 */
export async function mData<T extends readonly unknown[]>(
  requests: { [K in keyof T]: () => Promise<ApiResponse<T[K]>> },
  options: Omit<ApiBatchOptions, 'throwOnError'> = {},
): Promise<T> {
  const responses = await mFetch(requests, {
    ...options,
    throwOnError: true,
  })

  return responses.map((response) => response.data) as unknown as T
}
