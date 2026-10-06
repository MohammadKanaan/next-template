'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { TagsInput } from '@/components/Form/TagsInput'
import { Textarea } from '@/components/Form/Textarea'
import { LoadingButton } from '@/components/LoadingButton'
import { Button } from '@/components/SCN/button'
import {
  createPostInput,
  normalizeTagName,
  POST_TAGS_MAX,
  TAG_NAME_MAX_LENGTH,
  type CreatePostInput,
  type CreatePostParams,
  type PostDetail,
} from '@/lib/dto/posts'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'
import { hydratePostForm, POST_FORM_FIELDS } from './utils'

export type PostFormProps = {
  /** The post being edited, or `null` for a new one. */
  post: PostDetail | null
  submitLabel: string
  onSubmit: (values: CreatePostInput) => Promise<ActionResult<unknown>>
  onCancel?: () => void
}

export const PostForm = ({ post, submitLabel, onSubmit, onCancel }: PostFormProps) => {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreatePostParams, unknown, CreatePostInput>({
    resolver: zodResolver(createPostInput),
    defaultValues: hydratePostForm(post),
    // An existing post follows the `post` prop, so the form shows what a save returned.
    values: post ? hydratePostForm(post) : undefined,
  })

  const submit = handleSubmit(async (formValues) => {
    const result = await onSubmit(formValues)
    if (!result.ok) {
      applyActionErrors(result, POST_FORM_FIELDS, setError)
    }
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Input label="Title" required error={errors.title?.message} {...register('title')} />
      <Textarea label="Body" required rows={8} error={errors.body?.message} {...register('body')} />
      {/* A controlled field: the chips live in the parent, so it goes through `Controller`. */}
      <Controller
        control={control}
        name="tags"
        render={({ field }) => (
          <TagsInput
            ref={field.ref}
            name={field.name}
            label="Tags"
            value={field.value ?? []}
            onChange={field.onChange}
            onBlur={field.onBlur}
            normalize={normalizeTagName}
            maxTags={POST_TAGS_MAX}
            maxLength={TAG_NAME_MAX_LENGTH}
            error={errors.tags?.message}
          />
        )}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <LoadingButton type="submit" loading={isSubmitting} disabled={post !== null && !isDirty}>
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  )
}
