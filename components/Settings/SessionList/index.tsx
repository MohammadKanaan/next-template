'use client'

import { useState } from 'react'
import { LoadingButton } from '@/components/LoadingButton'
import { Badge } from '@/components/SCN/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/SCN/table'
import { formatDateTime } from '@/lib/formatDate'
import type { SessionSummary } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'
import styles from './styles.module.scss'

const OTHERS = 'others'

export type SessionListProps = {
  sessions: SessionSummary[]
  /** Signs one other session out (a Server Action). */
  onRevoke: (id: string) => Promise<ActionResult<unknown>>
  /** Signs every other session out (a Server Action). */
  onRevokeOthers: () => Promise<ActionResult<unknown>>
}

export function SessionList({ sessions, onRevoke, onRevokeOthers }: SessionListProps) {
  // Which request is running: a session id, `others`, or nothing.
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasOthers = sessions.some((session) => !session.current)

  const run = async (key: string, request: () => Promise<ActionResult<unknown>>) => {
    setError(null)
    setPending(key)
    try {
      const result = await request()
      if (!result.ok) {
        setError(result.message)
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={styles.list}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP address</TableHead>
            <TableHead>Signed in</TableHead>
            <TableHead>
              <span className={styles.srOnly}>Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                <div className={styles.deviceCell}>
                  <span className={styles.device} title={session.userAgent ?? undefined}>
                    {session.userAgent ?? 'Unknown device'}
                  </span>
                  {session.current && <Badge variant="secondary">This device</Badge>}
                </div>
              </TableCell>
              <TableCell>{session.ipAddress ?? 'Unknown'}</TableCell>
              <TableCell>{formatDateTime(session.createdAt)}</TableCell>
              <TableCell>
                {!session.current && (
                  <LoadingButton
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={pending === session.id}
                    disabled={pending !== null}
                    onClick={() => run(session.id, () => onRevoke(session.id))}
                  >
                    Revoke
                  </LoadingButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hasOthers && (
        <div className={styles.actions}>
          <LoadingButton
            type="button"
            variant="outline"
            loading={pending === OTHERS}
            disabled={pending !== null}
            onClick={() => run(OTHERS, onRevokeOthers)}
          >
            Sign out other devices
          </LoadingButton>
        </div>
      )}
    </div>
  )
}
