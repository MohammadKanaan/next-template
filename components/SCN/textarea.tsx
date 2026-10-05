import * as React from 'react'
import { Label } from '@/components/SCN/label'
import { cn } from '@/lib/utils'
import styles from './textarea.module.scss'

type TextareaProps = React.ComponentProps<'textarea'> & {
  label?: string
  error?: string
}

function Textarea({ className, label, error, required, id, ...props }: TextareaProps) {
  const generatedId = React.useId()
  const textareaId = id ?? generatedId
  const errorId = `${textareaId}-error`

  return (
    <div className={styles.field}>
      {label && (
        <Label htmlFor={textareaId} required={required}>
          {label}
        </Label>
      )}
      <textarea
        id={textareaId}
        data-slot="textarea"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'flex field-sizing-content min-h-16 w-full rounded-md border border-input',
          'bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          'md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

export { Textarea }
