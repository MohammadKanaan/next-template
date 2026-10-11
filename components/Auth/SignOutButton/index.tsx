'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { signOutAction } from '@/actions/auth'
import { LoadingButton } from '@/components/LoadingButton'
import { ROUTE_HOME } from '@/lib/constants-routes'

export const SignOutButton = () => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
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
