'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { setPostStatusAction } from '@/actions/posts'
import { Button } from '@/components/SCN/button'
import { POST_STATUS_TRANSITIONS, type PostStatus } from '@/lib/dto/posts'
import styles from './styles.module.scss'

/** What moving *to* a status is called; which moves exist comes from `POST_STATUS_TRANSITIONS`. */
const ACTION_LABELS: Record<PostStatus, string> = {
  published: 'Publish',
  archived: 'Archive',
  draft: 'Unpublish',
}

const SUCCESS_MESSAGES: Record<PostStatus, string> = {
  published: 'Post published',
  archived: 'Post archived',
  draft: 'Post moved back to drafts',
}

type PostStatusActionsProps = {
  postId: number
  status: PostStatus
}

export const PostStatusActions = ({ postId, status }: PostStatusActionsProps) => {
  const [isPending, startTransition] = useTransition()

  const handleMove = (next: PostStatus) => {
    startTransition(async () => {
      const result = await setPostStatusAction(postId, next)
      if (result.ok) {
        toast.success(SUCCESS_MESSAGES[next])
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className={styles.actions}>
      {POST_STATUS_TRANSITIONS[status].map((next) => (
        <Button
          key={next}
          type="button"
          size="sm"
          variant={next === 'published' ? 'default' : 'outline'}
          disabled={isPending}
          onClick={() => handleMove(next)}
        >
          {ACTION_LABELS[next]}
        </Button>
      ))}
    </div>
  )
}
