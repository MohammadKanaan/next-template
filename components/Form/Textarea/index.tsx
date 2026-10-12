import { useId, type ComponentProps } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea as ShadcnTextarea } from '@/components/ui/textarea'
import styles from './styles.module.scss'

type TextareaProps = Omit<ComponentProps<typeof ShadcnTextarea>, 'className' | 'style'> & {
  label?: string
  error?: string
}

export const Textarea = ({ label, error, required, id, ...props }: TextareaProps) => {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const errorId = `${textareaId}-error`

  return (
    <div className={styles.field}>
      {label && (
        <Label htmlFor={textareaId}>
          {label}
          {required && (
            <span className={styles.requiredMarker} aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}
      <ShadcnTextarea
        id={textareaId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
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
