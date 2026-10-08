'use client'

import { useEffect, useEffectEvent } from 'react'
import { realtimeEventSchema, type RealtimeEvent } from '@/lib/dto/notifications'
import { env } from '@/lib/env'

/**
 * Subscribes the component to the viewer's realtime stream (`GET /api/v1/events`) for as long as
 * it is mounted. The browser's `EventSource` reconnects on its own; the server resends the unread
 * count on every connect. Only mount it for a signed-in viewer. `onEvent` may change every render:
 * the stream is opened once and always calls the latest handler.
 */
export const useRealtime = (onEvent: (event: RealtimeEvent) => void): void => {
  const handleEvent = useEffectEvent(onEvent)

  useEffect(() => {
    const source = new EventSource(`${env.apiBaseUrl}/events`)
    source.onmessage = (message: MessageEvent<string>) => {
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
    return () => source.close()
  }, [])
}
