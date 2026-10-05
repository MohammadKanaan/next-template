'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/SCN/button'
import { Input } from '@/components/SCN/input'
import { loginSchema, type LoginFormValues } from '@/lib/validation/auth'
import type { ApiResponse } from '@/types/api'
import styles from './styles.module.scss'

export type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => Promise<ApiResponse<unknown>>
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '' } })

  const submit = handleSubmit(async (values) => {
    const response = await onSubmit(values)
    if (response.success) {
      return
    }
    const emailErrors = response.errors?.email
    if (emailErrors?.length) {
      setError('email', { type: 'server', message: emailErrors[0] })
    } else {
      setError('root.server', { type: 'server', message: response.message })
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
      <Button type="submit" loading={isSubmitting}>
        Sign in
      </Button>
      <p className={styles.hint}>Dev login: try leanne@example.com (seeded user).</p>
    </form>
  )
}
