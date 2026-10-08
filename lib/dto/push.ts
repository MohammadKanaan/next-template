import { z } from 'zod'

export const PUSH_ENDPOINT_MAX_LENGTH = 2048
const PUSH_KEY_MAX_LENGTH = 512

export const pushEndpointSchema = z.url().max(PUSH_ENDPOINT_MAX_LENGTH)

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
