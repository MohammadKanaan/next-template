import { z } from 'zod'

export const POST_TITLE_MAX_LENGTH = 200
export const POST_BODY_MAX_LENGTH = 5000

export const postFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(POST_TITLE_MAX_LENGTH, `Title must be ${POST_TITLE_MAX_LENGTH} characters or fewer`),
  body: z
    .string()
    .trim()
    .min(1, 'Body is required')
    .max(POST_BODY_MAX_LENGTH, `Body must be ${POST_BODY_MAX_LENGTH} characters or fewer`),
})

export const updatePostSchema = postFormSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one attribute')

export type PostFormValues = z.infer<typeof postFormSchema>
