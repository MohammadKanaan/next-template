import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { idSchema } from '@/lib/dto/common'
import { PostDetailView } from './view'

export const metadata: Metadata = {
  title: 'Post details',
}

export default async function PostDetailPage({ params }: PageProps<'/posts/[userId]/[id]'>) {
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
