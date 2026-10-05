'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/SCN/button'
import { Input } from '@/components/SCN/input'
import { ROUTE_LOGIN } from '@/lib/constants-routes'
import { signUpInput, type SignUpInput } from '@/lib/dto/auth'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type SignUpFormProps = {
  onSubmit: (values: SignUpInput) => Promise<ActionResult<unknown>>
}

export function SignUpForm({ onSubmit }: SignUpFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpInput),
    defaultValues: { name: '', username: '', email: '', password: '' },
  })

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values)
    if (!result.ok) {
      applyActionErrors(result, ['name', 'username', 'email', 'password'], setError)
    }
  })

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Input
        label="Name"
        autoComplete="name"
        required
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        label="Username"
        autoComplete="username"
        required
        error={errors.username?.message}
        {...register('username')}
      />
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
      <Button type="submit" loading={isSubmitting}>
        Create account
      </Button>
      <p className={styles.footer}>
        Already have an account? <Link href={ROUTE_LOGIN}>Log in</Link>
      </p>
    </form>
  )
}
