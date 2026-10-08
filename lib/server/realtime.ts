import 'server-only'
import { realtimeEventSchema, type RealtimeEvent } from '@/lib/dto/notifications'
import { logger } from './logger'
import { getRedis, getRedisSubscriber } from './redis'

const log = logger.child({ module: 'realtime' })

export type RealtimeListener = (event: RealtimeEvent) => void

// One Redis subscription per channel per process; listeners (open SSE streams) fan out in memory.
// `ready` settles when the channel's SUBSCRIBE has been acknowledged, and every caller awaits it.
type ChannelEntry = { listeners: Set<RealtimeListener>; ready: Promise<void> }
const channels = new Map<string, ChannelEntry>()
let wired = false

const dispatch = (channel: string, message: string) => {
  const channelListeners = channels.get(channel)?.listeners
  if (!channelListeners) {
    return
  }
  let event: RealtimeEvent
  try {
    event = realtimeEventSchema.parse(JSON.parse(message))
  } catch (error) {
    log.error({ err: error, channel }, 'dropped malformed message')
    return
  }
  for (const listener of channelListeners) {
    try {
      listener(event)
    } catch (error) {
      log.error({ err: error, channel }, 'listener failed')
    }
  }
}

const subscriber = () => {
  const client = getRedisSubscriber()
  if (!wired) {
    client.on('message', dispatch)
    wired = true
  }
  return client
}

/** Sends an event to every process subscribed to `channel`. Never throws: realtime is best effort. */
export const publish = async (channel: string, event: RealtimeEvent): Promise<void> => {
  try {
    await getRedis().publish(channel, JSON.stringify(event))
  } catch (error) {
    log.error({ err: error, channel }, 'publish failed')
  }
}

/**
 * Registers `listener` for `channel` and returns the function that removes it. The first listener
 * on a channel subscribes the process to it; every caller, first or later, waits for that
 * `SUBSCRIBE` before it resolves, so no event published after this resolves is missed. The last
 * listener leaving unsubscribes. A failed `SUBSCRIBE` rejects every waiting caller and leaves no
 * entry behind, so the events route answers 500 and `useRealtime` reopens the stream with backoff
 * (a non-200 response closes an `EventSource` for good; it does not retry on its own).
 */
export const subscribe = async (
  channel: string,
  listener: RealtimeListener,
): Promise<() => void> => {
  let entry = channels.get(channel)
  if (!entry) {
    const created: ChannelEntry = {
      listeners: new Set(),
      ready: (async () => {
        await subscriber().subscribe(channel)
      })(),
    }
    entry = created
    channels.set(channel, created)
    created.ready.catch(() => {
      if (channels.get(channel) === created) {
        channels.delete(channel)
      }
    })
  }
  const joined = entry
  joined.listeners.add(listener)
  await joined.ready
  return () => {
    if (!joined.listeners.delete(listener) || joined.listeners.size > 0) {
      return
    }
    if (channels.get(channel) !== joined) {
      return
    }
    channels.delete(channel)
    subscriber()
      .unsubscribe(channel)
      .catch((error) => log.error({ err: error, channel }, 'unsubscribe failed'))
  }
}
