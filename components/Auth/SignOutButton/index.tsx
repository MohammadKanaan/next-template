'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { signOutAction } from '@/actions/auth'
import { unsubscribePushAction } from '@/actions/push'
import { LoadingButton } from '@/components/LoadingButton'
import { unsubscribeBrowserPush } from '@/lib/client/push'
import { ROUTE_HOME } from '@/lib/constants-routes'

export const SignOutButton = () => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      // Before the session ends: the action needs it, and this browser must not keep receiving
      // the signed-out user's notifications. Best effort; a leftover row is cleaned on its 410.
      const endpoint = await unsubscribeBrowserPush()
      if (endpoint) {
        try {
          await unsubscribePushAction(endpoint)
        } catch {
          // Signing out matters more.
        }
      }
      await signOutAction()
      router.push(ROUTE_HOME)
    })
  }

  return (
    <LoadingButton
      type="button"
      variant="outline"
      size="sm"
      loading={isPending}
      onClick={handleClick}
    >
      Log out
    </LoadingButton>
  )
}
