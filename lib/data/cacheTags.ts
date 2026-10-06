import 'server-only'

/** Cache tags for `remember()` / `invalidateTags()`. Writes invalidate them inside the DAL. */
export const POSTS_TAG = 'posts'
export const postTag = (id: number) => `post:${id}`
export const userTag = (id: string) => `user:${id}`
export const commentsTag = (postId: number) => `comments:${postId}`
