import type { Metadata } from 'next'
import { cache } from 'react'
import { JsonLd } from '@/components/JsonLd'
import { ButtonLink } from '@/components/ButtonLink'
import { PageHeader } from '@/components/PageHeader'
import { DeletePostButton } from '@/components/Posts/DeleteButton'
import { PostStatusBadge } from '@/components/Posts/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/SCN/card'
import { ROUTE_POST_DETAILS, ROUTE_POST_EDIT, ROUTE_POSTS } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getPost } from '@/lib/data/posts'
import { siteUrl } from '@/lib/data/site'
import { formatDateTime } from '@/lib/formatDate'
import { metaDescription, NO_INDEX, SITE_OPEN_GRAPH } from '@/lib/seo'
import { postJsonLd } from '@/lib/structuredData'
import { presentUser } from '@/presenters/UserPresenter'
import styles from './styles.module.scss'

// `generateMetadata` and the page read the same post: one DAL call per request.
const loadPost = cache((id: string) => loadPage(() => getPost(id), ROUTE_POST_DETAILS(id)))

export const generateMetadata = async ({ params }: PageProps<'/posts/[id]'>): Promise<Metadata> => {
  const { id } = await params
  const post = await loadPost(id)
  // A draft is visible to its author and admins only: never in search results.
  if (!post.published) {
    return { title: post.title, robots: NO_INDEX }
  }
  const path = ROUTE_POST_DETAILS(post.id)
  const description = metaDescription(post.body)
  return {
    title: post.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...SITE_OPEN_GRAPH,
      type: 'article',
      url: path,
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.author.name],
    },
  }
}

/**
 * A Server Component page: it awaits the DAL and renders; only the two buttons are client
 * components. The raw route param goes to the DAL, which treats a malformed id as not found.
 */
const PostDetailPage = async ({ params }: PageProps<'/posts/[id]'>) => {
  const { id } = await params
  const post = await loadPost(id)
  const author = presentUser(post.author)

  return (
    <div className={styles.page}>
      {post.published && <JsonLd data={postJsonLd(post, siteUrl())} />}
      <PageHeader
        title={post.title}
        description={`By ${author.name} · ${formatDateTime(post.createdAt)}`}
        actions={
          <>
            <ButtonLink href={ROUTE_POSTS} variant="secondary">
              Back
            </ButtonLink>
            {post.permissions.update && (
              <ButtonLink href={ROUTE_POST_EDIT(post.id)} variant="outline">
                Edit
              </ButtonLink>
            )}
            {post.permissions.delete && <DeletePostButton postId={post.id} />}
          </>
        }
      />

      <div className={styles.cards}>
        <Card>
          <CardHeader>
            <CardTitle>Post</CardTitle>
          </CardHeader>
          <CardContent>
            {!post.published && (
              <div className={styles.badges}>
                <PostStatusBadge published={post.published} />
              </div>
            )}
            <p className={styles.postBody}>{post.body}</p>
            <p className={styles.meta}>Last updated {formatDateTime(post.updatedAt)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Author</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={styles.meta}>
              <strong>Name:</strong> {author.name}
            </p>
            <p className={styles.meta}>
              <strong>Username:</strong> @{author.username}
            </p>
            {author.website && (
              <p className={styles.meta}>
                <strong>Website:</strong>{' '}
                <a href={author.website} className={styles.link} target="_blank" rel="noreferrer">
                  {author.website}
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default PostDetailPage
