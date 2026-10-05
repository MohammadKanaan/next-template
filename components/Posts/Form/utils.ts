import type { PostFormValues } from '@/lib/validation/posts'
import type { PostAttributes, PostResponse } from '@/services/PostsService'

export const EMPTY_POST_FORM: PostFormValues = { title: '', body: '' }

export function hydratePostForm(post: PostResponse | null): PostFormValues {
  return post ? { title: post.title, body: post.body } : { ...EMPTY_POST_FORM }
}

export function isPostFormField(field: string): field is keyof PostFormValues {
  return Object.hasOwn(EMPTY_POST_FORM, field)
}

export function buildPostAttributes(
  values: PostFormValues,
  post: PostResponse | null,
): PostAttributes {
  const original = hydratePostForm(post)
  const attributes: PostAttributes = {}
  for (const field of Object.keys(values) as (keyof PostFormValues)[]) {
    if (post === null || values[field] !== original[field]) {
      attributes[field] = values[field]
    }
  }
  return attributes
}
