// Transport layers prefix their errors with the request, e.g. `[GET] "https://api/deals": 404 Not Found`.
const REQUEST_PREFIX_PATTERN = /^\[\w+\]\s*"[^"]*":\s*/
const NETWORK_ERROR_PATTERN =
  /failed to fetch|fetch failed|network error|<no response>|load failed|connection problem/i

export const NETWORK_ERROR_MESSAGE = 'Connection problem. Check your internet connection.'

export function isNetworkErrorMessage(message: string | undefined | null): boolean {
  return !!message && NETWORK_ERROR_PATTERN.test(message)
}

/** Turns a raw transport error into copy that is safe to show a user. */
export function humanizeErrorMessage(message: string | undefined) {
  if (!message) {
    return message
  }
  if (isNetworkErrorMessage(message)) {
    return NETWORK_ERROR_MESSAGE
  }

  return message.replace(REQUEST_PREFIX_PATTERN, '')
}
