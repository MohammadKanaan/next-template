import 'server-only'
import type { SessionUser } from '../auth'
import type { Rule } from '../policy'

/** What the post rules need to know about a post. */
export type PostRecord = { published: boolean; authorId: string }

/** The author or an admin. */
const isAuthorOrAdmin = (viewer: SessionUser | null, authorId: string) => {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin')
}

/**
 * Record-level rules for posts. Only published posts are public: a draft is visible to its author
 * and to admins, who are also the only ones who may change or delete a post.
 */
export const postPolicy = {
  view: (viewer, post) => post.published || isAuthorOrAdmin(viewer, post.authorId),
  update: (viewer, post) => isAuthorOrAdmin(viewer, post.authorId),
  delete: (viewer, post) => isAuthorOrAdmin(viewer, post.authorId),
} satisfies Record<string, Rule<PostRecord>>
