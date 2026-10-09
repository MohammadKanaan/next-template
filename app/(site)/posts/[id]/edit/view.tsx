'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updatePostAction } from '@/actions/posts'
import { PageHeader } from '@/components/PageHeader'
import { PostForm } from '@/components/Posts/Form'
import { buildPostAttributes } from '@/components/Posts/Form/utils'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { CreatePostInput, PostDetail } from '@/lib/dto/posts'
import styles from '../../styles.module.scss'

type PostEditViewProps = {
  post: PostDetail
}

export const PostEditView = ({ post }: PostEditViewProps) => {
  const router = useRouter()

  const handleSubmit = async (values: CreatePostInput) => {
    // Only what changed goes to the server; the DAL rejects an edit with nothing in it.
    const attributes = buildPostAttributes(values, post)
    if (Object.keys(attributes).length === 0) {
      toast('No changes to save')
      return { ok: true, data: null } as const
    }
    const result = await updatePostAction(post.id, attributes)
    if (result.ok) {
      toast.success('Post updated')
      router.push(ROUTE_POST_DETAILS(result.data.id))
    }
    return result
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Edit post" description="Change the title or body, or publish it." />
      <PostForm
        post={post}
        submitLabel="Save changes"
        onCancel={() => router.push(ROUTE_POST_DETAILS(post.id))}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
