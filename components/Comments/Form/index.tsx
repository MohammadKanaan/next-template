'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { createCommentAction } from '@/actions/comments'
import { Textarea } from '@/components/Form/Textarea'
import { LoadingButton } from '@/components/LoadingButton'
import {
  COMMENT_BODY_MAX_LENGTH,
  createCommentInput,
  type CreateCommentInput,
} from '@/lib/dto/comments'
import { applyActionErrors } from '@/lib/formErrors'
import styles from './styles.module.scss'

const COMMENT_FORM_FIELDS = ['body'] as const

type CommentFormProps = {
  postId: number
}

export const CommentForm = ({ postId }: CommentFormProps) => {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCommentInput>({
    resolver: zodResolver(createCommentInput),
    defaultValues: { body: '' },
  })

  const submit = handleSubmit(async (values) => {
    const result = await createCommentAction(postId, values)
    if (result.ok) {
      reset()
      toast.success('Comment added')
      return
    }
    applyActionErrors(result, COMMENT_FORM_FIELDS, setError)
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Textarea
        label="Add a comment"
        rows={3}
        maxLength={COMMENT_BODY_MAX_LENGTH}
        error={errors.body?.message}
        {...register('body')}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <div className={styles.actions}>
        <LoadingButton type="submit" loading={isSubmitting}>
          Comment
        </LoadingButton>
      </div>
    </form>
  )
}
