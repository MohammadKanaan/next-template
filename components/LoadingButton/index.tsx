import type { ComponentProps } from 'react'
import { Button } from '@/components/SCN/button'
import { Spinner } from '@/components/SCN/spinner'

type LoadingButtonProps = Omit<ComponentProps<typeof Button>, 'className' | 'style' | 'asChild'> & {
  loading?: boolean
}

export const LoadingButton = ({
  loading = false,
  disabled,
  children,
  ...props
}: LoadingButtonProps) => {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner aria-hidden="true" />}
      {children}
    </Button>
  )
}
