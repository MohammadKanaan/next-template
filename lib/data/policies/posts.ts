import 'server-only'
import type { PostStatus } from '@/lib/dto/posts'
import type { SessionUser } from '../auth'
import type { Rule } from '../policy'

/** What the post rules need to know about a post. */
export type PostRecord = { status: PostStatus; authorId: string; deletedAt: Date | null }

/** What the comment rules need to know about a comment. */
export type CommentRecord = { authorId: string; postAuthorId: string }

/** The author or an admin. */
const isAuthorOrAdmin = (viewer: SessionUser | null, authorId: string) => {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin')
}

/** A post in the trash is invisible to everyone but its author and admins, who may only restore it. */
const isLive = (post: PostRecord) => post.deletedAt === null

const canView: Rule<PostRecord> = (viewer, post) => {
  return isLive(post) && (post.status === 'published' || isAuthorOrAdmin(viewer, post.authorId))
}

/**
 * Record-level rules for posts. Only live, published posts are public: a draft or archived post is
 * visible to its author and to admins. A trashed post is not live: nothing but `restore` applies to
 * it, and `restore` is for its author and admins (`getPost` lets them read it).
 */
export const postPolicy = {
  view: canView,
  update: (viewer, post) => isLive(post) && isAuthorOrAdmin(viewer, post.authorId),
  delete: (viewer, post) => isLive(post) && isAuthorOrAdmin(viewer, post.authorId),
  changeStatus: (viewer, post) => isLive(post) && isAuthorOrAdmin(viewer, post.authorId),
  restore: (viewer, post) => !isLive(post) && isAuthorOrAdmin(viewer, post.authorId),
  // Comments are open on live, published posts the viewer can see.
  comment: (viewer, post) => post.status === 'published' && canView(viewer, post),
} satisfies Record<string, Rule<PostRecord>>

/** A comment goes when its author, the post's author or an admin removes it. */
export const commentPolicy = {
  delete: (viewer, comment) => {
    return (
      viewer !== null &&
      (viewer.id === comment.authorId ||
        viewer.id === comment.postAuthorId ||
        viewer.role === 'admin')
    )
  },
} satisfies Record<string, Rule<CommentRecord>>
