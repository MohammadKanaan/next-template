'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { Textarea } from '@/components/Form/Textarea'
import { LoadingButton } from '@/components/LoadingButton'
import { Button } from '@/components/SCN/button'
import {
  createPostInput,
  type CreatePostInput,
  type PostDetail,
  type PostDraft,
} from '@/lib/dto/posts'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'
import { hydratePostForm, isEmptyPostForm, POST_FORM_FIELDS } from './utils'

const DRAFT_DEBOUNCE_MS = 500

export type PostFormProps = {
  post: PostDetail | null
  submitLabel: string
  onSubmit: (values: CreatePostInput) => Promise<ActionResult<unknown>>
  onCancel?: () => void
  /** Saved draft that seeds a new post's fields (ignored when editing a post). */
  draft?: PostDraft | null
  /** Called, debounced, as the user types; `null` means the form is empty again. */
  onDraftChange?: (draft: PostDraft | null) => void
}

export function PostForm({
  post,
  submitLabel,
  onSubmit,
  onCancel,
  draft,
  onDraftChange,
}: PostFormProps) {
  const values = useMemo(() => hydratePostForm(post, draft), [post, draft])
  const {
    register,
    handleSubmit,
    setError,
    subscribe,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreatePostInput>({
    resolver: zodResolver(createPostInput),
    values,
    // The draft is written back into `values` as the user types; keep what they typed instead of
    // resetting the fields. Only the draft-aware (new post) form needs this.
    resetOptions: onDraftChange ? { keepDirtyValues: true } : undefined,
  })

  const onDraftChangeRef = useRef(onDraftChange)
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange
  })
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const saveDraft = useCallback(() => {
    const current = getValues()
    onDraftChangeRef.current?.(isEmptyPostForm(current) ? null : current)
  }, [getValues])

  const hasDraftHandler = onDraftChange !== undefined
  useEffect(() => {
    if (!hasDraftHandler) {
      return
    }
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: () => {
        clearTimeout(draftTimer.current)
        draftTimer.current = setTimeout(saveDraft, DRAFT_DEBOUNCE_MS)
      },
    })
    return () => {
      unsubscribe()
      clearTimeout(draftTimer.current)
    }
  }, [hasDraftHandler, subscribe, saveDraft])

  // `handleSubmit` runs inside the event handler: its callback touches a ref, which must not
  // happen while rendering.
  const submit = (event: FormEvent<HTMLFormElement>) =>
    handleSubmit(async (formValues) => {
      // A pending write must not recreate the draft after the caller cleared it on success.
      clearTimeout(draftTimer.current)
      const result = await onSubmit(formValues)
      if (!result.ok) {
        applyActionErrors(result, POST_FORM_FIELDS, setError)
        // The form stays open: keep what was typed.
        saveDraft()
      }
    })(event)

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
        <LoadingButton type="submit" loading={isSubmitting} disabled={post !== null && !isDirty}>
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  )
}
