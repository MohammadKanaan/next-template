import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { idSchema } from '@/lib/dto/common'
import { PostDetailView } from './view'

export const metadata: Metadata = {
  title: 'Post details',
}

type PostDetailParams = Pick<PageProps<'/posts/[userId]/[id]'>, 'params'>

async function PostDetail({ params }: PostDetailParams) {
  const { userId, id } = await params
  const postId = idSchema.safeParse(id)
  if (!postId.success) {
    notFound()
  }

  const post = await loadPage(() => getPost(postId.data), ROUTE_POST_DETAILS(userId, id))
  if (post.author.id !== userId) {
    redirect(ROUTE_POST_DETAILS(post.author.id, post.id))
  }

  return <PostDetailView post={post} />
}

export default function PostDetailPage({ params }: PageProps<'/posts/[userId]/[id]'>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostDetail params={params} />
    </Suspense>
  )
}
