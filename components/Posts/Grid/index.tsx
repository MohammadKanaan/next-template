import { PostsCard } from '@/components/Posts/Card'
import type { PostPresenter } from '@/presenters/Post/PostPresenter'
import styles from './styles.module.scss'

type PostsGridProps = {
  posts: PostPresenter[]
}

export function PostsGrid({ posts }: PostsGridProps) {
  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <PostsCard key={post.id} post={post} />
      ))}
    </div>
  )
}
