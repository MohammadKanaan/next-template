import { z } from 'zod'

export const PUSH_ENDPOINT_MAX_LENGTH = 2048
const PUSH_KEY_MAX_LENGTH = 512

/** Browsers a user can have push enabled on at once; the oldest subscriptions beyond it are dropped. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10

/** `https:` only: the worker posts to this URL, and every push service uses TLS. */
export const pushEndpointSchema = z.url({ protocol: /^https$/ }).max(PUSH_ENDPOINT_MAX_LENGTH)

/** The relevant part of `PushSubscription.toJSON()`; unknown keys (`expirationTime`) are dropped. */
export const pushSubscriptionInput = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(PUSH_KEY_MAX_LENGTH),
    auth: z.string().min(1).max(PUSH_KEY_MAX_LENGTH),
  }),
})

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>

/** What the browser needs to subscribe: the VAPID public key. Present only when push is configured. */
export const pushConfigSchema = z.object({ publicKey: z.string().min(1) })

export type PushConfig = z.infer<typeof pushConfigSchema>
