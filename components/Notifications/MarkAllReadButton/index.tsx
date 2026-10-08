'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { markAllNotificationsReadAction } from '@/actions/notifications'
import { LoadingButton } from '@/components/LoadingButton'

type MarkAllReadButtonProps = {
  /** Runs after a successful call, so the caller can update its own state. */
  onMarked?: () => void
  size?: 'sm' | 'default'
}

export const MarkAllReadButton = ({ onMarked, size = 'default' }: MarkAllReadButtonProps) => {
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    setPending(true)
    try {
      const result = await markAllNotificationsReadAction()
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onMarked?.()
    } finally {
      setPending(false)
    }
  }

  return (
    <LoadingButton
      type="button"
      variant="outline"
      size={size}
      loading={pending}
      onClick={handleClick}
    >
      Mark all read
    </LoadingButton>
  )
}
