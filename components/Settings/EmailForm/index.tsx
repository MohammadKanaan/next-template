'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { changeEmailInput, type ChangeEmailInput } from '@/lib/dto/auth'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type EmailFormProps = {
  onSubmit: (values: ChangeEmailInput) => Promise<ActionResult<unknown>>
}

export function EmailForm({ onSubmit }: EmailFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailInput),
    defaultValues: { newEmail: '' },
  })

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values)
    if (result.ok) {
      reset()
    } else {
      applyActionErrors(result, ['newEmail'], setError)
    }
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Input
        label="New email"
        type="email"
        autoComplete="email"
        required
        error={errors.newEmail?.message}
        {...register('newEmail')}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <div className={styles.actions}>
        <LoadingButton type="submit" loading={isSubmitting}>
          Change email
        </LoadingButton>
      </div>
    </form>
  )
}
