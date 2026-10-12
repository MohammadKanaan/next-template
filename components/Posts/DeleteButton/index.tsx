'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deletePostAction } from '@/actions/posts'
import { ActionButton } from '@/components/ActionButton'
import { LoadingButton } from '@/components/LoadingButton'
import { Button } from '@/components/SCN/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/SCN/dialog'
import { ROUTE_POSTS } from '@/lib/constants-routes'

type DeletePostButtonProps = {
  postId: string
}

export const DeletePostButton = ({ postId }: DeletePostButtonProps) => {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deletePostAction(postId)
      if (result.ok) {
        toast.success('Post deleted')
        router.push(ROUTE_POSTS)
        return
      }
      toast.error(result.message)
      setIsOpen(false)
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<ActionButton action="delete" label="Delete post" />} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this post?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={isPending} />}>
            Cancel
          </DialogClose>
          <LoadingButton
            type="button"
            variant="destructive"
            icon={Trash2}
            loading={isPending}
            onClick={handleConfirm}
          >
            Delete
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
