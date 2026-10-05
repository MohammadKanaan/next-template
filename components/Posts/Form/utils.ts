import type { CreatePostInput, PostDetail } from '@/lib/dto/posts'

export const POST_FORM_FIELDS = ['title', 'body'] as const

export const EMPTY_POST_FORM: CreatePostInput = { title: '', body: '' }

export function hydratePostForm(post: PostDetail | null): CreatePostInput {
  return post ? { title: post.title, body: post.body } : { ...EMPTY_POST_FORM }
}

/** New post: every field. Existing post: only the fields that changed. */
export function buildPostAttributes(
  values: CreatePostInput,
  post: PostDetail | null,
): Partial<CreatePostInput> {
  const original = hydratePostForm(post)
  const attributes: Partial<CreatePostInput> = {}
  for (const field of POST_FORM_FIELDS) {
    if (post === null || values[field] !== original[field]) {
      attributes[field] = values[field]
    }
  }
  return attributes
}
