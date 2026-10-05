'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/SCN/button'
import { Input } from '@/components/SCN/input'
import { Textarea } from '@/components/SCN/textarea'
import { createPostInput, type CreatePostInput, type PostDetail } from '@/lib/dto/posts'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'
import { hydratePostForm, POST_FORM_FIELDS } from './utils'

export type PostFormProps = {
  post: PostDetail | null
  submitLabel: string
  onSubmit: (values: CreatePostInput) => Promise<ActionResult<unknown>>
  onCancel?: () => void
}

export function PostForm({ post, submitLabel, onSubmit, onCancel }: PostFormProps) {
  const values = useMemo(() => hydratePostForm(post), [post])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreatePostInput>({ resolver: zodResolver(createPostInput), values })

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
        <Button type="submit" loading={isSubmitting} disabled={post !== null && !isDirty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
