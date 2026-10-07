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

/** Only the fields of an existing post that the form changed (a new post sends the values as is). */
export const buildPostAttributes = (
  values: CreatePostInput,
  post: PostDetail,
): Partial<CreatePostInput> => {
  const attributes: Partial<CreatePostInput> = {}
  if (values.title !== post.title) {
    attributes.title = values.title
  }
  if (values.body !== post.body) {
    attributes.body = values.body
  }
  if (!sameTags(values.tags, post.tags)) {
    attributes.tags = values.tags
  }
  return attributes
}
