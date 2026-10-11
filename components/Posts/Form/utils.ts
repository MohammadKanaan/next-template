import type { CreatePostInput, PostDetail, UpdatePostInput } from '@/lib/dto/posts'

export const POST_FORM_FIELDS = ['title', 'body', 'published'] as const

/** The form's values for an existing post, or empty fields for a new one (a draft). */
export const hydratePostForm = (post: PostDetail | null): CreatePostInput => {
  return post
    ? { title: post.title, body: post.body, published: post.published }
    : { title: '', body: '', published: false }
}

/** Only the fields of an existing post that the form changed (a new post sends the values as is). */
export const buildPostAttributes = (values: CreatePostInput, post: PostDetail): UpdatePostInput => {
  const attributes: UpdatePostInput = {}
  if (values.title !== post.title) {
    attributes.title = values.title
  }
  if (values.body !== post.body) {
    attributes.body = values.body
  }
  if (values.published !== post.published) {
    attributes.published = values.published
  }
  return attributes
}
