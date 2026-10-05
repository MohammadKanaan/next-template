import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Empty } from '@/components/Empty'
import { Button } from '@/components/SCN/button'
import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { idSchema } from '@/lib/dto/common'
import { PostEditView } from './view'

export const metadata: Metadata = {
  title: 'Edit post',
}

export default async function PostEditPage({ params }: PageProps<'/posts/[userId]/[id]/edit'>) {
  const { userId, id } = await params
  const postId = idSchema.safeParse(id)
  if (!postId.success) {
    notFound()
  }

  const post = await loadPage(() => getPost(postId.data), ROUTE_POST_EDIT(userId, id))
  if (!post.permissions.update) {
    return (
      <Empty
        title="You cannot edit this post"
        description="Only the author or an admin can change it."
        action={
          <Button asChild variant="secondary">
            <Link href={ROUTE_POST_DETAILS(post.author.id, post.id)}>Back to post</Link>
          </Button>
        }
      />
    )
  }

  return <PostEditView post={post} />
}
