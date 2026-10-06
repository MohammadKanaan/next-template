import { useId, type ComponentProps } from 'react'
import { Input as ShadcnInput } from '@/components/SCN/input'
import { Label } from '@/components/SCN/label'
import styles from './styles.module.scss'

type InputProps = Omit<ComponentProps<typeof ShadcnInput>, 'className' | 'style'> & {
  label?: string
  error?: string
}

export const Input = ({ label, error, required, id, ...props }: InputProps) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className={styles.field}>
      {label && (
        <Label htmlFor={inputId}>
          {label}
          {required && (
            <span className={styles.requiredMarker} aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}
      <ShadcnInput
        id={inputId}
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
