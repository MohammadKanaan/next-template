import type { CreatePostInput, PostDetail, PostDraft } from '@/lib/dto/posts'

export const POST_FORM_FIELDS = ['title', 'body'] as const

export const EMPTY_POST_FORM: CreatePostInput = { title: '', body: '' }

/** An existing post wins; a new post starts from the saved draft, if any. */
export const hydratePostForm = (
  post: PostDetail | null,
  draft?: PostDraft | null,
): CreatePostInput => {
  if (post) {
    return { title: post.title, body: post.body }
  }
  return draft ? { title: draft.title, body: draft.body } : { ...EMPTY_POST_FORM }
}

/** A form with nothing typed has no draft worth keeping. */
export const isEmptyPostForm = (values: CreatePostInput) => {
  return values.title === '' && values.body === ''
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
