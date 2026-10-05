import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PostDetailView } from './view'

export const metadata: Metadata = {
  title: 'Post details',
}

export default async function PostDetailPage({ params }: PageProps<'/posts/[userId]/[id]'>) {
  const { userId, id } = await params
  const postId = Number(id)
  const authorId = Number(userId)

  if (!Number.isInteger(postId) || postId < 1 || !Number.isInteger(authorId)) {
    notFound()
  }

  return <PostDetailView userId={authorId} id={postId} />
}
