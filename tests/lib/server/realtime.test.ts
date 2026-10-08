// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publish, subscribe } from '@/lib/server/realtime'
import { getRedis, getRedisSubscriber } from '@/lib/server/redis'
import type { RealtimeEvent } from '@/lib/dto/notifications'
import { resetRedis } from '../../helpers/server'

const CHANNEL = 'realtime:test'

describe('realtime', () => {
  beforeEach(resetRedis)
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await getRedisSubscriber().quit()
    await getRedis().quit()
  })

  it('delivers a published event to every listener on the channel', async () => {
    const first: RealtimeEvent[] = []
    const second: RealtimeEvent[] = []
    const unsubscribeFirst = await subscribe(CHANNEL, (event) => first.push(event))
    const unsubscribeSecond = await subscribe(CHANNEL, (event) => second.push(event))

    await publish(CHANNEL, { type: 'unread', count: 2 })

    await vi.waitFor(() => expect(first).toEqual([{ type: 'unread', count: 2 }]))
    expect(second).toEqual([{ type: 'unread', count: 2 }])
    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('revives dates in a notification event', async () => {
    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    const createdAt = new Date('2026-10-07T10:00:00.000Z')
    await publish(CHANNEL, {
      type: 'notification',
      notification: {
        id: 1,
        type: 'comment',
        title: 'T',
        body: '',
        url: '/x',
        readAt: null,
        createdAt,
      },
    })
    await vi.waitFor(() => expect(received).toHaveLength(1))
    const event = received[0]
    expect(event.type === 'notification' && event.notification.createdAt).toEqual(createdAt)
    unsubscribe()
  })

  it('stops delivering after unsubscribe and drops malformed messages', async () => {
    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    await getRedis().publish(CHANNEL, 'not json')
    await getRedis().publish(CHANNEL, JSON.stringify({ type: 'nope' }))
    await publish(CHANNEL, { type: 'unread', count: 1 })
    await vi.waitFor(() => expect(received).toHaveLength(1))

    unsubscribe()
    await publish(CHANNEL, { type: 'unread', count: 9 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(received).toHaveLength(1)
  })

  it('delivers to two concurrent first subscribers and waits for SUBSCRIBE before resolving', async () => {
    const subscriber = getRedisSubscriber()
    const original = subscriber.subscribe.bind(subscriber)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const spy = vi.spyOn(subscriber, 'subscribe').mockImplementationOnce(async (...args) => {
      await gate
      return original(...(args as Parameters<typeof original>))
    })
    const first: RealtimeEvent[] = []
    const second: RealtimeEvent[] = []
    let secondResolved = false
    const firstPromise = subscribe(CHANNEL, (event) => first.push(event))
    const secondPromise = subscribe(CHANNEL, (event) => second.push(event)).then((unsubscribe) => {
      secondResolved = true
      return unsubscribe
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(secondResolved).toBe(false)

    release()
    const [unsubscribeFirst, unsubscribeSecond] = await Promise.all([firstPromise, secondPromise])
    expect(spy).toHaveBeenCalledTimes(1)
    await publish(CHANNEL, { type: 'unread', count: 3 })

    await vi.waitFor(() => expect(first).toEqual([{ type: 'unread', count: 3 }]))
    expect(second).toEqual([{ type: 'unread', count: 3 }])
    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('keeps the subscription for a pending caller when a joiner leaves first', async () => {
    const subscriber = getRedisSubscriber()
    const original = subscriber.subscribe.bind(subscriber)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(subscriber, 'subscribe').mockImplementationOnce(async (...args) => {
      await gate
      return original(...(args as Parameters<typeof original>))
    })
    const received: RealtimeEvent[] = []
    const firstPromise = subscribe(CHANNEL, (event) => received.push(event))
    const joinerPromise = subscribe(CHANNEL, () => {})
    // The joiner's client leaves before SUBSCRIBE completes; the first caller must stay live.
    release()
    const [unsubscribe, unsubscribeJoiner] = await Promise.all([firstPromise, joinerPromise])
    unsubscribeJoiner()
    await publish(CHANNEL, { type: 'unread', count: 4 })

    await vi.waitFor(() => expect(received).toEqual([{ type: 'unread', count: 4 }]))
    unsubscribe()
  })

  it('rejects every concurrent caller when SUBSCRIBE fails and recovers on the next call', async () => {
    const subscriber = getRedisSubscriber()
    const spy = vi.spyOn(subscriber, 'subscribe').mockRejectedValueOnce(new Error('down'))
    const results = await Promise.allSettled([
      subscribe(CHANNEL, () => {}),
      subscribe(CHANNEL, () => {}),
    ])
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])

    const received: RealtimeEvent[] = []
    const unsubscribe = await subscribe(CHANNEL, (event) => received.push(event))
    expect(spy).toHaveBeenCalledTimes(2)
    await publish(CHANNEL, { type: 'unread', count: 5 })
    await vi.waitFor(() => expect(received).toEqual([{ type: 'unread', count: 5 }]))
    unsubscribe()
  })

  it('sends UNSUBSCRIBE when the last listener leaves, and only then', async () => {
    const spy = vi.spyOn(getRedisSubscriber(), 'unsubscribe')
    const unsubscribeFirst = await subscribe(CHANNEL, () => {})
    const unsubscribeSecond = await subscribe(CHANNEL, () => {})

    unsubscribeFirst()
    expect(spy).not.toHaveBeenCalled()
    unsubscribeSecond()
    unsubscribeSecond()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(CHANNEL)
  })

  it('never throws from publish when Redis fails', async () => {
    vi.spyOn(getRedis(), 'publish').mockRejectedValueOnce(new Error('down'))
    await expect(publish(CHANNEL, { type: 'unread', count: 1 })).resolves.toBeUndefined()
  })
})
