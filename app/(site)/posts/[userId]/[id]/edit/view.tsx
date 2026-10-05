'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Empty } from '@/components/Empty'
import { PageHeader } from '@/components/PageHeader'
import { PostForm } from '@/components/Posts/Form'
import { buildPostAttributes } from '@/components/Posts/Form/utils'
import { PostsState } from '@/components/Posts/State'
import { Button } from '@/components/SCN/button'
import { useApiData } from '@/hooks/useApiData'
import { sFetch } from '@/lib/apiCall'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import { queryKeys } from '@/lib/queryKeys'
import type { PostFormValues } from '@/lib/validation/posts'
import PostsService, { type PostDetailedResponse } from '@/services/PostsService'
import styles from '../styles.module.scss'

type PostEditViewProps = {
  id: number
}

export function PostEditView({ id }: PostEditViewProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const {
    data: post,
    isLoading,
    errorMessage,
    refresh,
  } = useApiData<PostDetailedResponse>(
    queryKeys.post(id),
    (signal) => PostsService.getById(id, signal),
    { toast: false },
  )

  const handleSubmit = async (values: PostFormValues) => {
    const attributes = buildPostAttributes(values, post)

    if (Object.keys(attributes).length === 0) {
      toast('No changes to save')
      return { success: true, status: 200, message: 'No changes', data: null }
    }

    const response = await sFetch(() => PostsService.update(id, attributes), {
      toast: false,
      throwOnError: false,
    })

    if (response.success && response.data) {
      queryClient.setQueryData(queryKeys.post(id), response.data)
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      toast.success('Post updated')
      router.push(ROUTE_POST_DETAILS(response.data.user_id, response.data.id))
    }

    return response
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Edit post" description="Update the title or body." />
      <PostsState
        loading={isLoading}
        empty={!isLoading && !errorMessage && !post}
        emptyMessage="No post found."
        errorMessage={errorMessage}
        onRetry={() => void refresh()}
      >
        {post && !post.permissions.update && (
          <Empty
            title="You cannot edit this post"
            description="Only the author can change it."
            action={
              <Button asChild variant="secondary">
                <Link href={ROUTE_POST_DETAILS(post.user_id, post.id)}>Back to post</Link>
              </Button>
            }
          />
        )}
        {post?.permissions.update && (
          <PostForm
            post={post}
            submitLabel="Save changes"
            onCancel={() => router.push(ROUTE_POST_DETAILS(post.user_id, post.id))}
            onSubmit={handleSubmit}
          />
        )}
      </PostsState>
    </div>
  )
}
