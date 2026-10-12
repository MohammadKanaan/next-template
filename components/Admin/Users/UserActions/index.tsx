'use client'

import { CircleCheck, LogOut, UserRoundCog } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  impersonateUserAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  unbanUserAction,
} from '@/actions/admin'
import { BanUserDialog } from '@/components/Admin/BanDialog'
import { Button } from '@/components/SCN/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/SCN/select'
import { ROUTE_HOME } from '@/lib/constants-routes'
import { roleSchema, type AdminUser } from '@/lib/dto/users'
import type { ActionResult } from '@/types/api'
import { ROLE_LABELS, ROLE_PHRASES } from '../roles'
import styles from './styles.module.scss'

type UserActionsProps = {
  user: AdminUser
  /** The signed-in admin's own account offers nothing but a disabled role picker. */
  isSelf: boolean
  /** Held by a parent while another row is saving. */
  disabled?: boolean
  /** Reports the start and end of this component's own write, so a parent can hold its siblings. */
  onBusy?: (busy: boolean) => void
  /** The user page's form: also offers to end every session of the user. */
  extended?: boolean
}

/** The role picker, ban / unban, impersonate (and sign out everywhere) for one user. */
export const UserActions = ({
  user,
  isSelf,
  disabled = false,
  onBusy,
  extended = false,
}: UserActionsProps) => {
  const [isSaving, setIsSaving] = useState(false)
  const held = disabled || isSaving

  const run = async (work: () => Promise<ActionResult<unknown>>) => {
    setIsSaving(true)
    onBusy?.(true)
    try {
      const result = await work()
      if (!result.ok) {
        toast.error(result.message)
      }
      return result.ok
    } finally {
      setIsSaving(false)
      onBusy?.(false)
    }
  }

  const handleRole = async (value: string | null) => {
    const role = roleSchema.safeParse(value)
    if (!role.success || role.data === user.role) {
      return
    }
    await run(async () => {
      const result = await setUserRoleAction({ id: user.id, role: role.data })
      if (result.ok) {
        toast.success(`${user.name} is now ${ROLE_PHRASES[role.data]}`)
      }
      return result
    })
  }

  const handleUnban = () =>
    run(async () => {
      const result = await unbanUserAction(user.id)
      if (result.ok) {
        toast.success(`${user.name} can sign in again`)
      }
      return result
    })

  const handleRevokeSessions = () =>
    run(async () => {
      const result = await revokeUserSessionsAction(user.id)
      if (result.ok) {
        toast.success(`${user.name} was signed out everywhere`)
      }
      return result
    })

  const handleImpersonate = async () => {
    const ok = await run(() => impersonateUserAction(user.id))
    if (ok) {
      // This browser is now signed in as the user, so every layout must be rendered again from
      // scratch: a full navigation, not the client router (the layout shows how to come back).
      window.location.assign(ROUTE_HOME)
    }
  }

  return (
    <div className={styles.actions}>
      <Select
        items={ROLE_LABELS}
        value={user.role}
        onValueChange={handleRole}
        disabled={isSelf || held}
      >
        <SelectTrigger size="sm" aria-label={`Role of ${user.name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleSchema.options.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isSelf && (
        <>
          {user.banned ? (
            <Button type="button" size="sm" variant="outline" disabled={held} onClick={handleUnban}>
              <CircleCheck data-icon="inline-start" aria-hidden="true" />
              Unban
            </Button>
          ) : (
            <BanUserDialog user={user} disabled={held} />
          )}
          {user.role !== 'admin' && !user.banned && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={held}
              onClick={handleImpersonate}
            >
              <UserRoundCog data-icon="inline-start" aria-hidden="true" />
              Impersonate
            </Button>
          )}
          {extended && user.role !== 'admin' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={held}
              onClick={handleRevokeSessions}
            >
              <LogOut data-icon="inline-start" aria-hidden="true" />
              Sign out everywhere
            </Button>
          )}
        </>
      )}
    </div>
  )
}
