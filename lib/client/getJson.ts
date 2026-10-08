import { z } from 'zod'
import { env } from '@/lib/env'
import { RequestError } from './errors'

const errorMessageSchema = z.object({ message: z.string() })

/**
 * The one `GET` of the client facades: `path` under the API base, every defined, non-empty key of
 * `query` as a search param (so a new filter needs no change in a facade), the response parsed
 * with the shared `lib/dto` schema, a failure thrown as `RequestError` (the body's `message`, else
 * `Request failed (<status>)` for an answer that is not the app's `ErrorBody`, e.g. a proxy's 502).
 */
export const getJson = async <T extends z.ZodType>(
  path: string,
  query: object,
  schema: T,
  signal?: AbortSignal,
): Promise<z.output<T>> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const response = await fetch(`${env.apiBaseUrl}${path}?${params}`, { signal })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = errorMessageSchema.safeParse(body)
    throw new RequestError(
      parsed.success ? parsed.data.message : `Request failed (${response.status})`,
      response.status,
    )
  }
  return schema.parse(body)
}
