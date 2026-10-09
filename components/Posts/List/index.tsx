import Link from 'next/link'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
import { ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import type { PostSummary } from '@/lib/dto/posts'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

type PostListProps = {
  posts: PostSummary[]
}

/** A Server Component: cards of post summaries. Drafts are marked (an admin may see them). */
export const PostList = ({ posts }: PostListProps) => {
  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <article key={post.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.title}>
              <Link href={ROUTE_POST_DETAILS(post.id)} className={styles.link}>
                {post.title}
              </Link>
            </h3>
            {!post.published && <PostStatusBadge published={false} />}
          </div>
          {post.excerpt && <p className={styles.body}>{post.excerpt}</p>}
          <p className={styles.byline}>
            by {post.author.name} · {formatDateTime(post.createdAt)}
          </p>
        </article>
      ))}
    </div>
  )
}
