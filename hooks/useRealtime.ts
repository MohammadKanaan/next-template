'use client'

import { useEffect, useEffectEvent } from 'react'
import { realtimeEventSchema, type RealtimeEvent } from '@/lib/dto/notifications'
import { env } from '@/lib/env'

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/**
 * Subscribes the component to the viewer's realtime stream (`GET /api/v1/events`) for as long as
 * it is mounted. The server resends the unread count on every connect. `EventSource` reconnects on
 * its own after a network drop or a clean close, but a non-200 answer (500 while Redis is down,
 * 502 during a deploy) closes it for good, so `onerror` reopens a closed stream with a backoff
 * (1 s, doubling to 30 s, back to 1 s once a connection opens). Only mount it for a signed-in
 * viewer. `onEvent` may change every render: the stream is opened once and always calls the latest
 * handler.
 */
export const useRealtime = (onEvent: (event: RealtimeEvent) => void): void => {
  const handleEvent = useEffectEvent(onEvent)

  useEffect(() => {
    let source: EventSource | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = RECONNECT_MIN_MS

    const connect = () => {
      const current = new EventSource(`${env.apiBaseUrl}/events`)
      source = current
      current.onopen = () => {
        delay = RECONNECT_MIN_MS
      }
      current.onmessage = (message: MessageEvent<string>) => {
        let data: unknown
        try {
          data = JSON.parse(message.data)
        } catch {
          return
        }
        const parsed = realtimeEventSchema.safeParse(data)
        if (parsed.success) {
          handleEvent(parsed.data)
        }
      }
      current.onerror = () => {
        // Still CONNECTING means the browser is retrying by itself.
        if (current.readyState !== EventSource.CLOSED) {
          return
        }
        current.close()
        timer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, RECONNECT_MAX_MS)
      }
    }

    connect()
    return () => {
      clearTimeout(timer)
      source?.close()
    }
  }, [])
}
