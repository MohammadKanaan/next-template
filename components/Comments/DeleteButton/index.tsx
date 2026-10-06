'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { deleteCommentAction } from '@/actions/comments'
import { Button } from '@/components/SCN/button'

type DeleteCommentButtonProps = {
  commentId: number
}

export const DeleteCommentButton = ({ commentId }: DeleteCommentButtonProps) => {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCommentAction(commentId)
      if (result.ok) {
        toast.success('Comment deleted')
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Delete comment"
      disabled={isPending}
      onClick={handleDelete}
    >
      <Trash2 aria-hidden="true" />
    </Button>
  )
}
