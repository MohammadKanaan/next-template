import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PostEditView } from './view'

export const metadata: Metadata = {
  title: 'Edit post',
}

export default async function PostEditPage({ params }: PageProps<'/posts/[userId]/[id]/edit'>) {
  const { id } = await params
  const postId = Number(id)

  if (!Number.isInteger(postId) || postId < 1) {
    notFound()
  }

  return <PostEditView id={postId} />
}
