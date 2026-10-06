'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/SCN/button'
import styles from './styles.module.scss'

type PaginationProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  disabled?: boolean
}

export const Pagination = ({ page, totalPages, onPageChange, disabled }: PaginationProps) => {
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous page"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className={styles.page}>
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next page"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}
