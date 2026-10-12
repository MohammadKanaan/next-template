import Link from 'next/link'
import type { ComponentProps } from 'react'
import { RECORD_ACTIONS, type RecordAction } from '@/components/ActionButton/actions'
import { buttonVariants } from '@/components/SCN/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/SCN/tooltip'

type ActionLinkProps = Omit<ComponentProps<typeof Link>, 'className' | 'style' | 'children'> & {
  action: RecordAction
  /** The link's accessible name and tooltip, e.g. "Edit Dune". */
  label: string
}

/** `ActionButton` as a link: a record action that is a page (view it, edit it elsewhere). */
export const ActionLink = ({ action, label, ...props }: ActionLinkProps) => {
  const { icon: Icon, variant } = RECORD_ACTIONS[action]

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            className={buttonVariants({ variant, size: 'icon-sm' })}
            aria-label={label}
            {...props}
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
