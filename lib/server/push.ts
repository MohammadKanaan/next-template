import 'server-only'
import webpush from 'web-push'
import { serverEnv } from './env'

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }

/** What `public/sw.js` reads from a push message. */
export type PushPayload = { title: string; body: string; url: string }

/** Seconds a push service keeps an undelivered message. */
const PUSH_TTL_SECONDS = 60 * 60

/** The push service no longer knows the subscription (404 / 410): drop it, do not retry. */
export class PushGoneError extends Error {
  constructor(readonly endpoint: string) {
    super('Push subscription is gone')
    this.name = 'PushGoneError'
  }
}

/**
 * The push service answered with an error status. Deliberately carries only the status: a raw
 * `WebPushError` holds the endpoint, headers and body, which would end up in the worker log.
 */
export class PushSendError extends Error {
  constructor(readonly statusCode: number) {
    super(`Push failed (${statusCode})`)
    this.name = 'PushSendError'
  }
}

/** Per-request socket timeout, so a tarpit endpoint cannot hold a worker socket open. */
const PUSH_TIMEOUT_MS = 10_000

/** Web Push is on only when the VAPID trio is set (`serverEnv()` rejects a partial trio). */
export const isPushConfigured = (): boolean => serverEnv().VAPID_PRIVATE_KEY !== undefined

export const getPushPublicKey = (): string | null => serverEnv().VAPID_PUBLIC_KEY ?? null

let configured = false

/** Forgets that the VAPID details were handed to `web-push`; for tests. */
export const resetPushConfig = () => {
  configured = false
}

const configure = () => {
  if (configured) {
    return
  }
  const env = serverEnv()
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error(
      'Web Push is not configured: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT',
    )
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
}

/** Sends one push message. Only the worker calls this (the `send-push` job). */
export const sendPush = async (target: PushTarget, payload: PushPayload): Promise<void> => {
  configure()
  try {
    await webpush.sendNotification(target, JSON.stringify(payload), {
      TTL: PUSH_TTL_SECONDS,
      timeout: PUSH_TIMEOUT_MS,
    })
  } catch (error) {
    if (error instanceof webpush.WebPushError) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        throw new PushGoneError(target.endpoint)
      }
      throw new PushSendError(error.statusCode)
    }
    throw error
  }
}
