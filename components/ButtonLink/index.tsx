import type { ComponentProps } from 'react'
import type { VariantProps } from 'class-variance-authority'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, 'className' | 'style'> &
  VariantProps<typeof buttonVariants>

/**
 * A link styled as a button. Base UI's `Button` sets `role="button"` on whatever it renders, so a
 * link keeps its link role only as a plain `Link` with the button classes (shadcn's "As Link").
 */
export const ButtonLink = ({ variant, size, ...props }: ButtonLinkProps) => {
  return <Link className={buttonVariants({ variant, size })} {...props} />
}
