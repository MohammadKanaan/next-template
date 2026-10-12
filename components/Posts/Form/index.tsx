'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { Textarea } from '@/components/Form/Textarea'
import { LoadingButton } from '@/components/LoadingButton'
import { Button } from '@/components/SCN/button'
import { Checkbox } from '@/components/SCN/checkbox'
import { Label } from '@/components/SCN/label'
import { ShortcutHint } from '@/components/ShortcutHint'
import {
  createPostInput,
  type CreatePostInput,
  type CreatePostParams,
  type PostDetail,
} from '@/lib/dto/posts'
import { applyActionErrors } from '@/lib/formErrors'
import { SUBMIT_KEYSHORTCUTS, submitOnShortcut } from '@/lib/keyboard'
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
  const publishedId = useId()
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
    <form className={styles.form} onSubmit={submit} onKeyDown={submitOnShortcut} noValidate>
      <Input label="Title" required error={errors.title?.message} {...register('title')} />
      <Textarea label="Body" required rows={8} error={errors.body?.message} {...register('body')} />
      {/* The checkbox is a Base UI control, not a native input, so it goes through `Controller`. */}
      <Controller
        control={control}
        name="published"
        render={({ field }) => (
          <div className={styles.toggle}>
            <Checkbox
              id={publishedId}
              name={field.name}
              ref={field.ref}
              checked={field.value ?? false}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
            />
            <Label htmlFor={publishedId}>Published</Label>
            <span className={styles.hint}>A draft is visible to you and admins only.</span>
          </div>
        )}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <div className={styles.actions}>
        <ShortcutHint action={`to ${submitLabel.toLowerCase()}`} />
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <LoadingButton
          type="submit"
          aria-keyshortcuts={SUBMIT_KEYSHORTCUTS}
          loading={isSubmitting}
          disabled={post !== null && !isDirty}
        >
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  )
}
