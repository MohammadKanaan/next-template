import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ButtonLink'
import { Empty } from '@/components/Empty'
import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { PostEditView } from './view'

export const metadata: Metadata = {
  title: 'Edit post',
}

const PostEditPage = async ({ params }: PageProps<'/posts/[id]/edit'>) => {
  const { id } = await params
  const post = await loadPage(() => getPost(id), ROUTE_POST_EDIT(id))
  if (!post.permissions.update) {
    return (
      <Empty
        title="You cannot edit this post"
        description="Only the author or an admin can change it."
        action={
          <ButtonLink href={ROUTE_POST_DETAILS(post.id)} variant="secondary">
            Back to post
          </ButtonLink>
        }
      />
    )
  }

  return <PostEditView post={post} />
}

export default PostEditPage
