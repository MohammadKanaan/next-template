import { useId, type ComponentProps } from 'react'
import { Button } from '@/components/SCN/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/SCN/tooltip'
import { RECORD_ACTIONS, type RecordAction } from './actions'
import styles from './styles.module.scss'

type ActionButtonProps = Omit<
  ComponentProps<typeof Button>,
  'className' | 'style' | 'children' | 'variant' | 'size'
> & {
  action: RecordAction
  /** The button's accessible name and tooltip, e.g. "Delete review". */
  label: string
  /** Why the button is disabled: its tooltip and its accessible description. */
  disabledReason?: string
}

/**
 * An icon button for a record action (view, edit, delete) with its label as a tooltip. The action
 * picks the icon and the colour. Extra props reach the button, so it can be the `render` of a
 * dialog trigger: `<DialogTrigger render={<ActionButton action="delete" label="Delete" />} />`.
 */
export const ActionButton = ({ action, label, disabledReason, ...props }: ActionButtonProps) => {
  const reasonId = useId()
  const { icon: Icon, variant } = RECORD_ACTIONS[action]
  const showReason = props.disabled === true && disabledReason !== undefined
  const button = (
    <Button
      type="button"
      variant={variant}
      size="icon-sm"
      aria-label={label}
      aria-describedby={showReason ? reasonId : undefined}
      {...props}
    >
      <Icon aria-hidden="true" />
    </Button>
  )

  // A disabled button takes no pointer events, so a wrapper holds the tooltip.
  if (showReason) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className={styles.disabled} />}>
          {button}
          <span id={reasonId} className={styles.reason}>
            {disabledReason}
          </span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
