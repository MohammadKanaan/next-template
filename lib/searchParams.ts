type RawSearchParams = Record<string, string | string[] | undefined>

/**
 * Reduces a query string to one scalar per key, the last value winning (`?q=a&q=b` is `b`), so the
 * server (a page's `searchParams` record) and the client (`URLSearchParams`) read the same URL the
 * same way before a Zod URL schema parses it.
 */
export function toScalarParams(input: URLSearchParams | RawSearchParams): Record<string, string> {
  if (input instanceof URLSearchParams) {
    return Object.fromEntries(input)
  }
  const scalars: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    const last = Array.isArray(value) ? value.at(-1) : value
    if (last !== undefined) {
      scalars[key] = last
    }
  }
  return scalars
}
