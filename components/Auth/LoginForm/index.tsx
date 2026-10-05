'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { ROUTE_SIGNUP } from '@/lib/constants-routes'
import { signInInput, type SignInInput } from '@/lib/dto/auth'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type LoginFormProps = {
  onSubmit: (values: SignInInput) => Promise<ActionResult<unknown>>
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInInput),
    defaultValues: { email: '', password: '' },
  })

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values)
    if (!result.ok) {
      applyActionErrors(result, ['email', 'password'], setError)
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
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
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
        Sign in
      </LoadingButton>
      {process.env.NODE_ENV !== 'production' && (
        <p className={styles.hint}>
          Dev login: leanne@example.com / password123 (admin: admin@example.com).
        </p>
      )}
      <p className={styles.footer}>
        No account? <Link href={ROUTE_SIGNUP}>Sign up</Link>
      </p>
    </form>
  )
}
