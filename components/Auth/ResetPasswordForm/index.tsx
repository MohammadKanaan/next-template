'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { resetPasswordInput, type ResetPasswordInput } from '@/lib/dto/auth'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type ResetPasswordFormProps = {
  /** The single-use token from the emailed link; submitted with the new password. */
  token: string
  onSubmit: (values: ResetPasswordInput) => Promise<ActionResult<unknown>>
}

export const ResetPasswordForm = ({ token, onSubmit }: ResetPasswordFormProps) => {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordInput),
    defaultValues: { token, password: '' },
  })

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values)
    if (!result.ok) {
      applyActionErrors(result, ['password'], setError)
    }
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.password?.message}
        {...register('password')}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <LoadingButton type="submit" loading={isSubmitting}>
        Reset password
      </LoadingButton>
    </form>
  )
}
