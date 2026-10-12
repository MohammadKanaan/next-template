import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import type { SortDirection } from '@/lib/dto/common'
import styles from './styles.module.scss'

type SortableTableHeadProps = {
  children: string
  className?: string
  direction?: SortDirection
  onSort: (direction: SortDirection) => void
}

/** A column's sort control; an inactive column starts ascending. */
export const SortableTableHead = ({
  children,
  className,
  direction,
  onSort,
}: SortableTableHeadProps) => {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown

  return (
    <TableHead
      className={className}
      aria-sort={
        direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined
      }
    >
      <button
        type="button"
        className={styles.sort}
        onClick={() => onSort(direction === 'asc' ? 'desc' : 'asc')}
        title={`Sort ${children.toLowerCase()} ${direction === 'asc' ? 'descending' : 'ascending'}`}
      >
        {children}
        <Icon aria-hidden="true" />
      </button>
    </TableHead>
  )
}
