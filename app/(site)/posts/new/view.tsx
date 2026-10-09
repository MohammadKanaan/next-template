'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createPostAction } from '@/actions/posts'
import { PageHeader } from '@/components/PageHeader'
import { PostForm } from '@/components/Posts/Form'
import { ROUTE_POST_DETAILS, ROUTE_POSTS } from '@/lib/constants-routes'
import type { CreatePostInput } from '@/lib/dto/posts'
import styles from '../styles.module.scss'

export const PostNewView = () => {
  const router = useRouter()

  const handleSubmit = async (values: CreatePostInput) => {
    const result = await createPostAction(values)
    if (result.ok) {
      toast.success(result.data.published ? 'Post published' : 'Draft saved')
      router.push(ROUTE_POST_DETAILS(result.data.id))
    }
    return result
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Write a post" description="Save it as a draft or publish it right away." />
      <PostForm
        post={null}
        submitLabel="Create post"
        onCancel={() => router.push(ROUTE_POSTS)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
