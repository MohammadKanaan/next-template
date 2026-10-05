'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { PostForm } from '@/components/Posts/Form'
import { buildPostAttributes } from '@/components/Posts/Form/utils'
import { sFetch } from '@/lib/apiCall'
import { ROUTE_POST_DETAILS, ROUTE_POSTS } from '@/lib/constants-routes'
import type { PostFormValues } from '@/lib/validation/posts'
import PostsService, { type CreatePostAttributes } from '@/services/PostsService'
import styles from '../styles.module.scss'

export function PostNewView() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const handleSubmit = async (values: PostFormValues) => {
    const response = await sFetch(
      () => PostsService.create(buildPostAttributes(values, null) as CreatePostAttributes),
      { toast: false, throwOnError: false },
    )

    if (response.success && response.data) {
      toast.success('Post created')
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      router.push(ROUTE_POST_DETAILS(response.data.user_id, response.data.id))
    }

    return response
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Write a post" description="Share something with everyone." />
      <PostForm
        post={null}
        submitLabel="Create post"
        onCancel={() => router.push(ROUTE_POSTS)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
