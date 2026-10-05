'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/SCN/button'
import { Input } from '@/components/SCN/input'
import { Textarea } from '@/components/SCN/textarea'
import { postFormSchema, type PostFormValues } from '@/lib/validation/posts'
import type { PostResponse } from '@/services/PostsService'
import type { ApiResponse } from '@/types/api'
import styles from './styles.module.scss'
import { hydratePostForm, isPostFormField } from './utils'

export type PostFormProps = {
  post: PostResponse | null
  submitLabel: string
  onSubmit: (values: PostFormValues) => Promise<ApiResponse<unknown>>
  onCancel?: () => void
}

export function PostForm({ post, submitLabel, onSubmit, onCancel }: PostFormProps) {
  const values = useMemo(() => hydratePostForm(post), [post])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<PostFormValues>({ resolver: zodResolver(postFormSchema), values })

  const submit = handleSubmit(async (formValues) => {
    const response = await onSubmit(formValues)
    if (response.success) {
      return
    }
    const fieldErrors = Object.entries(response.errors ?? {}).filter(([field]) =>
      isPostFormField(field),
    )
    for (const [field, messages] of fieldErrors) {
      setError(field as keyof PostFormValues, { type: 'server', message: messages[0] })
    }
    if (fieldErrors.length === 0) {
      setError('root.server', { type: 'server', message: response.message })
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
