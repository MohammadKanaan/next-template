'use client'

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react'
import { LoadingButton } from '@/components/LoadingButton'
import { pushSubscriptionInput, type PushSubscriptionInput } from '@/lib/dto/push'
import { urlBase64ToUint8Array } from '@/lib/push'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

const SERVICE_WORKER_URL = '/sw.js'

export type PushSettingsProps = {
  /** The VAPID public key (push is configured when the card renders). */
  publicKey: string
  /** Stores the browser's subscription (a Server Action). */
  onSubscribe: (input: PushSubscriptionInput) => Promise<ActionResult<unknown>>
  /** Forgets it (a Server Action). */
  onUnsubscribe: (endpoint: string) => Promise<ActionResult<unknown>>
}

type Registration = 'pending' | 'ready' | 'failed'

const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window

const subscribeToNothing = () => () => {}

/** Best effort: drops a browser subscription the server did not keep, so both sides agree. */
const forget = async (subscription: PushSubscription | undefined) => {
  try {
    await subscription?.unsubscribe()
  } catch {
    // Nothing more to do; the next enable or disable repairs it.
  }
}

/** The browser APIs exist, or null while rendering on the server (and on the first client render). */
const useCanPush = () => useSyncExternalStore(subscribeToNothing, canPush, () => null)

export const PushSettings = ({ publicKey, onSubscribe, onUnsubscribe }: PushSettingsProps) => {
  const supported = useCanPush()
  const [registration, setRegistration] = useState<Registration>('pending')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The browser is the source of truth for "enabled", so a subscription it already holds is sent
  // again once (the upsert is idempotent and re-owns) in case the server row was lost or belongs
  // to someone else. A failure is ignored: the next enable or disable repairs it.
  const resync = useEffectEvent(async (current: PushSubscription) => {
    const input = pushSubscriptionInput.safeParse(current.toJSON())
    if (!input.success) {
      return
    }
    try {
      await onSubscribe(input.data)
    } catch {
      // Ignored on purpose.
    }
  })

  useEffect(() => {
    if (!supported) {
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        const worker = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
        const current = await worker.pushManager.getSubscription()
        if (!cancelled) {
          setSubscription(current)
          setRegistration('ready')
          if (current) {
            void resync(current)
          }
        }
      } catch {
        if (!cancelled) {
          setRegistration('failed')
        }
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [supported])

  const enable = async () => {
    setError(null)
    setPending(true)
    let next: PushSubscription | undefined
    try {
      const worker = await navigator.serviceWorker.ready
      next = await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const input = pushSubscriptionInput.safeParse(next.toJSON())
      if (!input.success) {
        await forget(next)
        setError('This browser returned an unusable subscription.')
        return
      }
      const result = await onSubscribe(input.data)
      if (!result.ok) {
        await forget(next)
        setError(result.message)
        return
      }
      setSubscription(next)
    } catch {
      await forget(next)
      setError('Notifications were not enabled. Check the browser permission and try again.')
    } finally {
      setPending(false)
    }
  }

  const disable = async () => {
    if (!subscription) {
      return
    }
    setError(null)
    setPending(true)
    try {
      const result = await onUnsubscribe(subscription.endpoint)
      if (!result.ok) {
        setError(result.message)
        return
      }
      await subscription.unsubscribe()
      setSubscription(null)
    } catch {
      setError('Notifications were not disabled. Try again.')
    } finally {
      setPending(false)
    }
  }

  if (supported === null || (supported && registration === 'pending')) {
    return <p className={styles.hint}>Checking this browser…</p>
  }
  if (!supported || registration === 'failed') {
    return <p className={styles.hint}>Browser notifications are not supported here.</p>
  }

  return (
    <div className={styles.settings}>
      <p className={styles.hint}>
        {subscription
          ? 'This browser shows a notification when someone comments on your posts, even with the tab closed.'
          : 'Get a notification from this browser when someone comments on your posts.'}
      </p>
      {subscription ? (
        <LoadingButton type="button" variant="outline" loading={pending} onClick={disable}>
          Disable browser notifications
        </LoadingButton>
      ) : (
        <LoadingButton type="button" loading={pending} onClick={enable}>
          Enable browser notifications
        </LoadingButton>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
