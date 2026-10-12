'use client'
// React Hook Form's `register()` must run on every render; the React Compiler would cache it.
'use no memo'

import { zodResolver } from '@hookform/resolvers/zod'
import { Ban } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { banUserAction } from '@/actions/admin'
import { Input } from '@/components/Form/Input'
import { LoadingButton } from '@/components/LoadingButton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { banUserInput, type AdminUser, type BanUserInput } from '@/lib/dto/users'
import { applyActionErrors } from '@/lib/formErrors'
import styles from './styles.module.scss'

type BanUserDialogProps = {
  user: AdminUser
  disabled?: boolean
}

/** Asks for an optional reason, then bans the user; Better Auth shows the reason at their next sign-in. */
export const BanUserDialog = ({ user, disabled }: BanUserDialogProps) => {
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BanUserInput>({
    resolver: zodResolver(banUserInput),
    defaultValues: { id: user.id, reason: '' },
  })

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      reset()
    }
  }

  const submit = handleSubmit(async (values) => {
    const result = await banUserAction(values)
    if (result.ok) {
      toast.success(`${user.name} is banned`)
      handleOpenChange(false)
      return
    }
    applyActionErrors(result, ['reason'], setError)
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" size="sm" variant="destructive" disabled={disabled} />}
      >
        <Ban data-icon="inline-start" aria-hidden="true" />
        Ban
      </DialogTrigger>
      <DialogContent>
        <form className={styles.form} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Ban {user.name}?</DialogTitle>
            <DialogDescription>
              They are signed out everywhere and cannot sign in until you unban them.
            </DialogDescription>
          </DialogHeader>
          <Input
            label="Reason"
            placeholder="Shown to them when they try to sign in"
            error={errors.reason?.message}
            {...register('reason')}
          />
          {errors.root?.server && (
            <p className={styles.formError} role="alert">
              {errors.root.server.message}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <LoadingButton type="submit" variant="destructive" loading={isSubmitting}>
              Ban user
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
