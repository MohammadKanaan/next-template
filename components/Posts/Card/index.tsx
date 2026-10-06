import Link from 'next/link'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
import { PostTags } from '@/components/Posts/Tags'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { PostSummary } from '@/lib/dto/posts'
import styles from './styles.module.scss'

type PostsCardProps = {
  post: PostSummary
}

export const PostsCard = ({ post }: PostsCardProps) => {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.title}>{post.title}</h3>
        <span className={styles.pill}>#{post.id}</span>
      </div>

      {/* Public lists only hold published posts; an admin also sees the others, so mark those. */}
      {post.status !== 'published' && (
        <div>
          <PostStatusBadge status={post.status} />
        </div>
      )}

      {post.excerpt && <p className={styles.body}>{post.excerpt}</p>}

      <PostTags tags={post.tags} />

      <p className={styles.byline}>
        by {post.author.name} • {post.commentCount}{' '}
        {post.commentCount === 1 ? 'comment' : 'comments'}
      </p>

      <div className={styles.actions}>
        <Link href={ROUTE_POST_DETAILS(post.author.id, post.id)} className={styles.link}>
          View
        </Link>
      </div>
    </article>
  )
}
