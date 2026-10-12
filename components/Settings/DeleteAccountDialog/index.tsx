'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { Button } from '@/components/SCN/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/SCN/dialog'
import { deleteAccountInput, type DeleteAccountInput } from '@/lib/dto/auth'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

export type DeleteAccountDialogProps = {
  onConfirm: (values: DeleteAccountInput) => Promise<ActionResult<unknown>>
}

export const DeleteAccountDialog = ({ onConfirm }: DeleteAccountDialogProps) => {
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountInput),
    defaultValues: { password: '' },
  })

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      reset()
    }
  }

  const submit = handleSubmit(async (values) => {
    const result = await onConfirm(values)
    if (!result.ok) {
      applyActionErrors(result, ['password'], setError)
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        Delete account
      </DialogTrigger>
      <DialogContent>
        <form className={styles.form} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your account and your posts. It cannot be undone. Enter your
              password to confirm.
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <LoadingButton type="submit" variant="destructive" loading={isSubmitting}>
              Delete my account
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
