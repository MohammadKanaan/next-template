'use client'

import { useId } from 'react'
import { Empty } from '@/components/Empty'
import { Pagination } from '@/components/Pagination'
import { Label } from '@/components/SCN/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/SCN/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/SCN/table'
import { useUrlState } from '@/hooks/useUrlState'
import {
  auditEntityTypeSchema,
  auditUrlQuery,
  type AuditAction,
  type AuditEntry,
  type AuditMetadata,
} from '@/lib/dto/audit'
import type { Page } from '@/lib/dto/common'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

/** Select items cannot have an empty value, so "no filter" is this sentinel in the control. */
const ALL = '__ALL__'

const ACTION_LABELS: Record<AuditAction, string> = {
  'post.create': 'Created a post',
  'post.update': 'Edited a post',
  'post.status': 'Changed a post status',
  'post.delete': 'Moved a post to the trash',
  'post.restore': 'Restored a post',
  'comment.delete': 'Deleted a comment',
  'user.role': 'Changed a user role',
}

const formatMetadata = (metadata: AuditMetadata | null) => {
  if (!metadata) {
    return ''
  }
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ')
}

type AuditViewProps = {
  entries: Page<AuditEntry>
}

export const AuditView = ({ entries }: AuditViewProps) => {
  const { state, setState, isPending } = useUrlState(auditUrlQuery)
  const filterId = useId()

  const handleEntityType = (value: string) => {
    if (value === ALL) {
      setState({ entityType: '', page: 1 })
      return
    }
    const parsed = auditEntityTypeSchema.safeParse(value)
    if (parsed.success) {
      setState({ entityType: parsed.data, page: 1 })
    }
  }

  return (
    <div className={styles.view}>
      <div className={styles.filter}>
        <Label htmlFor={filterId}>Entity</Label>
        <Select value={state.entityType || ALL} onValueChange={handleEntityType}>
          <SelectTrigger id={filterId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All entities</SelectItem>
            <SelectItem value="post">Posts</SelectItem>
            <SelectItem value="comment">Comments</SelectItem>
            <SelectItem value="user">Users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {entries.items.length === 0 ? (
        <Empty title="No entries" description="Nothing has been recorded for this filter yet." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                <TableCell>
                  {entry.actor ? (
                    <div className={styles.actor}>
                      <span>{entry.actor.name}</span>
                      <span className={styles.username}>@{entry.actor.username}</span>
                    </div>
                  ) : (
                    <span className={styles.username}>Deleted user</span>
                  )}
                </TableCell>
                <TableCell>{ACTION_LABELS[entry.action]}</TableCell>
                <TableCell>
                  <div className={styles.actor}>
                    <span>{entry.entityType}</span>
                    <span className={styles.entityId}>{entry.entityId}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={styles.details}>{formatMetadata(entry.metadata)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination
        page={entries.page}
        totalPages={entries.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
