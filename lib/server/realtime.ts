import 'server-only'
import { realtimeEventSchema, type RealtimeEvent } from '@/lib/dto/notifications'
import { logger } from './logger'
import { getRedis, getRedisSubscriber } from './redis'

const log = logger.child({ module: 'realtime' })

export type RealtimeListener = (event: RealtimeEvent) => void

// One Redis subscription per channel per process; listeners (open SSE streams) fan out in memory.
const listeners = new Map<string, Set<RealtimeListener>>()
let wired = false

const dispatch = (channel: string, message: string) => {
  const channelListeners = listeners.get(channel)
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
 * on a channel subscribes the process to it (awaited, so no event published after this resolves
 * is missed); the last one leaving unsubscribes. A failed `SUBSCRIBE` propagates, so the caller
 * (the events route) fails and the browser's `EventSource` retries.
 */
export const subscribe = async (
  channel: string,
  listener: RealtimeListener,
): Promise<() => void> => {
  let channelListeners = listeners.get(channel)
  if (!channelListeners) {
    channelListeners = new Set()
    listeners.set(channel, channelListeners)
    try {
      await subscriber().subscribe(channel)
    } catch (error) {
      listeners.delete(channel)
      throw error
    }
  }
  channelListeners.add(listener)
  return () => {
    const current = listeners.get(channel)
    if (!current?.delete(listener) || current.size > 0) {
      return
    }
    listeners.delete(channel)
    subscriber()
      .unsubscribe(channel)
      .catch((error) => log.error({ err: error, channel }, 'unsubscribe failed'))
  }
}
