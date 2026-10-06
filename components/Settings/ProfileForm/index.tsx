'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { updateProfileInput, type CurrentUser, type UpdateProfileInput } from '@/lib/dto/users'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'
import { hydrateProfileForm, PROFILE_FORM_FIELDS } from './utils'

export type ProfileFormProps = {
  user: CurrentUser
  onSubmit: (values: UpdateProfileInput) => Promise<ActionResult<unknown>>
}

export function ProfileForm({ user, onSubmit }: ProfileFormProps) {
  const values = useMemo(() => hydrateProfileForm(user), [user])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileInput), values })

  const submit = handleSubmit(async (formValues) => {
    const result = await onSubmit(formValues)
    if (!result.ok) {
      applyActionErrors(result, PROFILE_FORM_FIELDS, setError)
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
        label="Website"
        autoComplete="url"
        placeholder="example.com"
        error={errors.website?.message}
        {...register('website')}
      />
      {errors.root?.server && (
        <p className={styles.formError} role="alert">
          {errors.root.server.message}
        </p>
      )}
      <div className={styles.actions}>
        <LoadingButton type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save profile
        </LoadingButton>
      </div>
    </form>
  )
}
