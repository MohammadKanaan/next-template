'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { ROUTE_LOGIN } from '@/lib/constants-routes'
import { requestPasswordResetInput, type RequestPasswordResetInput } from '@/lib/dto/auth'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type ForgotPasswordFormProps = {
  onSubmit: (values: RequestPasswordResetInput) => Promise<ActionResult<unknown>>
}

export const ForgotPasswordForm = ({ onSubmit }: ForgotPasswordFormProps) => {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetInput),
    defaultValues: { email: '' },
  })

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values)
    if (!result.ok) {
      applyActionErrors(result, ['email'], setError)
    }
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register('email')}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <LoadingButton type="submit" loading={isSubmitting}>
        Send reset link
      </LoadingButton>
      <p className={styles.footer}>
        Remembered it? <Link href={ROUTE_LOGIN}>Log in</Link>
      </p>
    </form>
  )
}
