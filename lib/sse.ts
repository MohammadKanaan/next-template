/** One `data:` message of a server-sent event stream (JSON, so the client parses one line). */
export const formatSseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`

/** A comment line: ignored by `EventSource`, keeps proxies from closing an idle connection. */
export const formatSseComment = (text: string) => `: ${text}\n\n`
