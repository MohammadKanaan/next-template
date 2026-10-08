'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { restorePostAction } from '@/actions/posts'
import { LoadingButton } from '@/components/LoadingButton'

type RestorePostButtonProps = {
  postId: number
}

export const RestorePostButton = ({ postId }: RestorePostButtonProps) => {
  const [isPending, startTransition] = useTransition()

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restorePostAction(postId)
      if (result.ok) {
        toast.success('Post restored')
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <LoadingButton type="button" size="sm" loading={isPending} onClick={handleRestore}>
      Restore
    </LoadingButton>
  )
}
