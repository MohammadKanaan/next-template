import 'server-only'
import type { PostStatus } from '@/lib/dto/posts'
import type { SessionUser } from '../auth'
import type { Rule } from '../policy'

/** What the post rules need to know about a post. */
export type PostRecord = { status: PostStatus; authorId: string }

/** What the comment rules need to know about a comment. */
export type CommentRecord = { authorId: string; postAuthorId: string }

/** The author or an admin. */
const isAuthorOrAdmin = (viewer: SessionUser | null, authorId: string) => {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin')
}

const canView: Rule<PostRecord> = (viewer, post) => {
  return post.status === 'published' || isAuthorOrAdmin(viewer, post.authorId)
}

/**
 * Record-level rules for posts. Only published posts are public: a draft or archived post is
 * visible to its author and to admins. Changing a post is for the author or an admin.
 */
export const postPolicy = {
  view: canView,
  update: (viewer, post) => isAuthorOrAdmin(viewer, post.authorId),
  delete: (viewer, post) => isAuthorOrAdmin(viewer, post.authorId),
  changeStatus: (viewer, post) => isAuthorOrAdmin(viewer, post.authorId),
  // Comments are open on published posts the viewer can see.
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

/**
 * Whether the viewer may see a post of this status and author. Exported for `createComment`, which
 * reads its row straight from the database; a pure predicate that returns no data.
 */
export const canViewPost = (viewer: SessionUser | null, status: PostStatus, authorId: string) => {
  return postPolicy.view(viewer, { status, authorId })
}
