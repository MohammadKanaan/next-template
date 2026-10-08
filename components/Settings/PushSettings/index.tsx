'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
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

/** The browser APIs exist, or null while rendering on the server (and on the first client render). */
const useCanPush = () => useSyncExternalStore(subscribeToNothing, canPush, () => null)

export const PushSettings = ({ publicKey, onSubscribe, onUnsubscribe }: PushSettingsProps) => {
  const supported = useCanPush()
  const [registration, setRegistration] = useState<Registration>('pending')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    try {
      const worker = await navigator.serviceWorker.ready
      const next = await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const input = pushSubscriptionInput.safeParse(next.toJSON())
      if (!input.success) {
        setError('This browser returned an unusable subscription.')
        return
      }
      const result = await onSubscribe(input.data)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSubscription(next)
    } catch {
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
