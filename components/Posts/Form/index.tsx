'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useEffectEvent, useRef, type FormEvent } from 'react'
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
  /**
   * Saved draft for a new post (ignored when editing). It is put into the fields once, when it
   * first becomes available and nothing has been typed yet; later changes to it are not fed back.
   */
  draft?: PostDraft | null
  /** Called, debounced, as the user types; `null` means the form is empty again. */
  onDraftChange?: (draft: PostDraft | null) => void
}

export const PostForm = ({
  post,
  submitLabel,
  onSubmit,
  onCancel,
  draft,
  onDraftChange,
}: PostFormProps) => {
  // An existing post follows the `post` prop. A new post only starts from the draft: feeding the
  // draft back through `values` would reset the form (and its errors) on every autosave.
  const {
    register,
    handleSubmit,
    setError,
    reset,
    subscribe,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreatePostInput>({
    resolver: zodResolver(createPostInput),
    defaultValues: hydratePostForm(post, draft),
    values: post ? hydratePostForm(post) : undefined,
  })

  // The stored draft is unknown while hydrating and shows up on a later render: restore it once.
  const draftRestored = useRef(false)
  useEffect(() => {
    if (post !== null || !draft || draftRestored.current) {
      return
    }
    draftRestored.current = true
    if (isEmptyPostForm(getValues())) {
      reset(draft)
    }
  }, [post, draft, reset, getValues])

  // Set once the post was created: nothing may be written to the draft after that.
  const submitted = useRef(false)

  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const saveDraft = () => {
    if (submitted.current) {
      return
    }
    const current = getValues()
    onDraftChange?.(isEmptyPostForm(current) ? null : current)
  }
  // The debounce timer fires long after the effect below ran: an Effect Event calls the latest
  // `saveDraft` without the effect having to re-subscribe when it changes.
  const saveDraftFromTimer = useEffectEvent(saveDraft)

  const hasDraftHandler = onDraftChange !== undefined
  useEffect(() => {
    if (!hasDraftHandler) {
      return
    }
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: () => {
        clearTimeout(draftTimer.current)
        draftTimer.current = setTimeout(() => saveDraftFromTimer(), DRAFT_DEBOUNCE_MS)
      },
    })
    return () => {
      unsubscribe()
      clearTimeout(draftTimer.current)
    }
  }, [hasDraftHandler, subscribe])

  // `handleSubmit` runs inside the event handler: its callback touches a ref, which must not
  // happen while rendering.
  const submit = (event: FormEvent<HTMLFormElement>) =>
    handleSubmit(async (formValues) => {
      // A pending write must not recreate the draft after the caller cleared it on success.
      clearTimeout(draftTimer.current)
      const result = await onSubmit(formValues)
      if (result.ok) {
        submitted.current = true
        clearTimeout(draftTimer.current)
      } else {
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
