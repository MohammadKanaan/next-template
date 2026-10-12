'use client'

import { useState, type ComponentProps } from 'react'
import { ActionButton } from '@/components/ActionButton'
import type { RecordAction } from '@/components/ActionButton/actions'
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
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

type ButtonVariant = ComponentProps<typeof Button>['variant']
type ButtonSize = ComponentProps<typeof Button>['size']

type ConfirmDialogProps<T> = {
  /** The text of the button that opens the dialog; with `triggerAction`, its label. */
  trigger: string
  /** Makes the trigger a record action's icon button (`ActionButton`) labelled `trigger`. */
  triggerAction?: RecordAction
  triggerVariant?: ButtonVariant
  triggerSize?: ButtonSize
  /** Why the trigger is disabled, shown on hover and focus. */
  triggerTitle?: string
  title: string
  description: string
  confirmLabel: string
  /** `destructive` (the default) for deletes. */
  confirmVariant?: ButtonVariant
  disabled?: boolean
  /** The write; a failure's message is shown in the dialog, which stays open. */
  onConfirm: () => Promise<ActionResult<T>>
  /** After a success, once the dialog has closed (navigate, toast). */
  onDone?: (data: T) => void
}

/** Asks before an irreversible write and shows the server's refusal where the question was asked. */
export const ConfirmDialog = <T,>({
  trigger,
  triggerAction,
  triggerVariant = 'destructive',
  triggerSize = 'sm',
  triggerTitle,
  title,
  description,
  confirmLabel,
  confirmVariant = 'destructive',
  disabled = false,
  onConfirm,
  onDone,
}: ConfirmDialogProps<T>) => {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setError(null)
    }
  }

  const confirm = async () => {
    setIsPending(true)
    setError(null)
    try {
      const result = await onConfirm()
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOpen(false)
      onDone?.(result.data)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerAction ? (
        <DialogTrigger
          render={
            <ActionButton
              action={triggerAction}
              label={trigger}
              disabled={disabled}
              disabledReason={triggerTitle}
            />
          }
        />
      ) : (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant={triggerVariant}
              size={triggerSize}
              disabled={disabled}
              title={triggerTitle}
            />
          }
        >
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
          <LoadingButton
            type="button"
            variant={confirmVariant}
            loading={isPending}
            onClick={confirm}
          >
            {confirmLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
