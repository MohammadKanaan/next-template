'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deletePostAction } from '@/actions/posts'
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
  postId: number
}

export const DeletePostButton = ({ postId }: DeletePostButtonProps) => {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deletePostAction(postId)
      if (result.ok) {
        toast.success('Post moved to trash')
        router.push(ROUTE_POSTS)
        return
      }
      toast.error(result.message)
      setIsOpen(false)
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          Move to trash
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move this post to the trash?</DialogTitle>
          <DialogDescription>
            It disappears for everyone else. You can restore it from your trash within 30 days;
            after that it is deleted for good.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <LoadingButton
            type="button"
            variant="destructive"
            loading={isPending}
            onClick={handleConfirm}
          >
            Move to trash
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
