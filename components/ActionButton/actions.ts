import { Eye, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import type { buttonVariants } from '@/components/SCN/button'

type ButtonVariant = NonNullable<Parameters<typeof buttonVariants>[0]>['variant']

/** What a record action does; it decides the icon and the colour, so every page agrees. */
export type RecordAction = 'view' | 'edit' | 'delete'

/**
 * One look per action: viewing is quiet, editing neutral and deleting red. Actions sit in this
 * order (view, edit, delete), so delete is always the last one in a row.
 */
export const RECORD_ACTIONS: Record<RecordAction, { icon: LucideIcon; variant: ButtonVariant }> = {
  view: { icon: Eye, variant: 'ghost' },
  edit: { icon: Pencil, variant: 'secondary' },
  delete: { icon: Trash2, variant: 'destructive' },
}
