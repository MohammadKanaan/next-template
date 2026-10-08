// @vitest-environment node
import webpush from 'web-push'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerEnv } from '@/lib/server/env'
import {
  getPushPublicKey,
  isPushConfigured,
  PushGoneError,
  PushSendError,
  resetPushConfig,
  sendPush,
} from '@/lib/server/push'

vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message)
    }
  }
  return {
    default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})), WebPushError },
  }
})

const target = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }
const payload = { title: 'T', body: 'B', url: '/posts/u/1' }

// The real constructor is (message, statusCode, headers, body, endpoint); the mock reads two.
const pushError = (message: string, statusCode: number) =>
  new webpush.WebPushError(message, statusCode, {}, '', target.endpoint)

describe('push', () => {
  beforeEach(() => {
    resetServerEnv()
    resetPushConfig()
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.co')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerEnv()
    vi.mocked(webpush.sendNotification).mockClear()
  })

  it('reports whether push is configured and exposes the public key', () => {
    expect(isPushConfigured()).toBe(true)
    expect(getPushPublicKey()).toBe('pub')
    resetServerEnv()
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('VAPID_SUBJECT', '')
    expect(isPushConfigured()).toBe(false)
    expect(getPushPublicKey()).toBeNull()
  })

  it('sends the JSON payload to the subscription', async () => {
    await sendPush(target, payload)
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:a@b.co', 'pub', 'priv')
    expect(webpush.sendNotification).toHaveBeenCalledWith(target, JSON.stringify(payload), {
      TTL: 3600,
      timeout: 10_000,
    })
  })

  it('maps 404 and 410 to PushGoneError and lets other failures propagate', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(pushError('gone', 410))
    await expect(sendPush(target, payload)).rejects.toBeInstanceOf(PushGoneError)
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(pushError('nf', 404))
    await expect(sendPush(target, payload)).rejects.toMatchObject({ endpoint: target.endpoint })
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(pushError('busy', 500))
    await expect(sendPush(target, payload)).rejects.not.toBeInstanceOf(PushGoneError)
  })

  it('hides the endpoint, headers and body of a failed send behind a PushSendError', async () => {
    const failure = pushError('Received unexpected response code', 500)
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(failure)
    const error = await sendPush(target, payload).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PushSendError)
    expect(error).toMatchObject({ statusCode: 500, message: 'Push failed (500)' })
    expect(JSON.stringify(error)).not.toContain(target.endpoint)
    expect((error as Error).cause).toBeUndefined()
  })

  it('lets an error that is not a WebPushError propagate as it is', async () => {
    const failure = new Error('socket hang up')
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(failure)
    await expect(sendPush(target, payload)).rejects.toBe(failure)
  })

  it('refuses to send when push is not configured', async () => {
    resetServerEnv()
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    vi.stubEnv('VAPID_SUBJECT', '')
    await expect(sendPush(target, payload)).rejects.toThrow(/not configured/)
  })
})
