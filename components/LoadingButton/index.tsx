import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/SCN/button'
import { Spinner } from '@/components/SCN/spinner'

type LoadingButtonProps = Omit<
  ComponentProps<typeof Button>,
  'className' | 'style' | 'render' | 'nativeButton'
> & {
  loading?: boolean
  /**
   * The button's icon, before its label. The spinner takes its place while loading, so an
   * icon-only button (`size="icon-sm"` and an `aria-label`) keeps its size.
   */
  icon?: LucideIcon
}

export const LoadingButton = ({
  loading = false,
  disabled,
  children,
  icon: Icon,
  ...props
}: LoadingButtonProps) => {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <Spinner data-icon="inline-start" aria-hidden="true" />
      ) : (
        Icon && <Icon data-icon="inline-start" aria-hidden="true" />
      )}
      {children}
    </Button>
  )
}
