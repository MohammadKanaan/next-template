import { toErrorResponse } from '@/lib/data/errors'
import { subscribeToNotifications } from '@/lib/data/notifications'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { formatSseComment, formatSseEvent } from '@/lib/sse'

/** Under most proxies' idle timeouts (nginx defaults to 60 s). */
const HEARTBEAT_MS = 25_000

/**
 * A stream lives at most this long. The session is checked once, when the stream opens; ending it
 * cleanly makes `EventSource` reconnect (it does so after a clean close), and the reconnect
 * authenticates again, so a revoked or expired session stops receiving within this time.
 */
const STREAM_MAX_MS = 10 * 60_000

/**
 * The viewer's realtime stream (server-sent events). The first message is the unread count, so a
 * reconnect (which `EventSource` does on its own) resyncs the badge; after that every event
 * published on the viewer's channel is forwarded. Ends when the client disconnects, or after
 * `STREAM_MAX_MS` (see above).
 */
export const GET = async (request: Request) => {
  const encoder = new TextEncoder()
  // Filled in once the stream starts; an event in the tiny gap before that is covered by the
  // unread count computed by the DAL after subscribing.
  let deliver: (event: RealtimeEvent) => void = () => {}
  let subscription: Awaited<ReturnType<typeof subscribeToNotifications>>
  try {
    // Signed in (401) before any stream exists; the DAL picks the channel.
    subscription = await subscribeToNotifications((event) => deliver(event))
  } catch (error) {
    return toErrorResponse(error)
  }
  const { unreadCount, unsubscribe } = subscription

  let heartbeat: ReturnType<typeof setInterval> | undefined
  let lifetime: ReturnType<typeof setTimeout> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // The stream is already closed; nothing to deliver to.
        }
      }
      const close = () => {
        clearInterval(heartbeat)
        clearTimeout(lifetime)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }
      // The client left while the subscribe was pending: its abort already fired, so a listener
      // added now would never hear it, and the response is no longer being read (no `cancel`).
      if (request.signal.aborted) {
        close()
        return
      }
      deliver = (event) => send(formatSseEvent(event))
      send(formatSseEvent({ type: 'unread', count: unreadCount }))
      heartbeat = setInterval(() => send(formatSseComment('ping')), HEARTBEAT_MS)
      lifetime = setTimeout(close, STREAM_MAX_MS)
      request.signal.addEventListener('abort', close, { once: true })
    },
    cancel() {
      clearInterval(heartbeat)
      clearTimeout(lifetime)
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` makes Next's gzip skip this response, so events are not buffered.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
