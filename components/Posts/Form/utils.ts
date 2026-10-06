import type { CreatePostInput, PostDetail } from '@/lib/dto/posts'

export const POST_FORM_FIELDS = ['title', 'body', 'tags'] as const

/** The form's values for an existing post, or empty fields for a new one. */
export const hydratePostForm = (post: PostDetail | null): CreatePostInput => {
  return post
    ? { title: post.title, body: post.body, tags: post.tags }
    : { title: '', body: '', tags: [] }
}

const sameTags = (a: string[], b: string[]) => {
  return a.length === b.length && a.every((tag) => b.includes(tag))
}

/** New post: every field. Existing post: only the fields that changed. */
export const buildPostAttributes = (
  values: CreatePostInput,
  post: PostDetail | null,
): Partial<CreatePostInput> => {
  const original = hydratePostForm(post)
  const attributes: Partial<CreatePostInput> = {}
  if (post === null || values.title !== original.title) {
    attributes.title = values.title
  }
  if (post === null || values.body !== original.body) {
    attributes.body = values.body
  }
  if (post === null || !sameTags(values.tags, original.tags)) {
    attributes.tags = values.tags
  }
  return attributes
}
