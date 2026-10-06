import type { CreatePostInput, PostDetail } from '@/lib/dto/posts'

export const POST_FORM_FIELDS = ['title', 'body'] as const

/** The form's values for an existing post, or empty fields for a new one. */
export const hydratePostForm = (post: PostDetail | null): CreatePostInput => {
  return post ? { title: post.title, body: post.body } : { title: '', body: '' }
}

/** New post: every field. Existing post: only the fields that changed. */
export const buildPostAttributes = (
  values: CreatePostInput,
  post: PostDetail | null,
): Partial<CreatePostInput> => {
  const original = hydratePostForm(post)
  const attributes: Partial<CreatePostInput> = {}
  for (const field of POST_FORM_FIELDS) {
    if (post === null || values[field] !== original[field]) {
      attributes[field] = values[field]
    }
  }
  return attributes
}
