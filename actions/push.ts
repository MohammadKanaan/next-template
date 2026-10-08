'use server'

import { toActionFailure } from '@/lib/data/errors'
import { deletePushSubscription, savePushSubscription } from '@/lib/data/push'
import type { PushSubscriptionInput } from '@/lib/dto/push'
import type { ActionResult } from '@/types/api'

/** Stores the browser's push subscription (the DAL rate limits it per user). */
export const subscribePushAction = async (
  input: PushSubscriptionInput,
): Promise<ActionResult<null>> => {
  try {
    await savePushSubscription(input)
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}

export const unsubscribePushAction = async (endpoint: string): Promise<ActionResult<null>> => {
  try {
    await deletePushSubscription(endpoint)
    return { ok: true, data: null }
  } catch (error) {
    return toActionFailure(error)
  }
}
