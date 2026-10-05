'use client'

import { useQuery, type QueryKey } from '@tanstack/react-query'
import { sData, type ApiCallOptions } from '@/lib/apiCall'
import type { ApiResponse } from '@/types/api'

type UseApiDataOptions = Pick<ApiCallOptions, 'toast' | 'fallbackErrorMessage'> & {
  enabled?: boolean
}

export function useApiData<T>(
  key: QueryKey,
  fetcher: (signal: AbortSignal) => Promise<ApiResponse<T>>,
  { enabled = true, ...callOptions }: UseApiDataOptions = {},
) {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => sData(() => fetcher(signal), callOptions),
    enabled,
  })

  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
    errorMessage: query.error?.message ?? '',
    hasData: query.data != null,
    refresh: query.refetch,
  }
}
