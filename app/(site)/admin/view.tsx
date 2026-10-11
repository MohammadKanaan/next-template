'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { impersonateUserAction, setUserRoleAction, unbanUserAction } from '@/actions/admin'
import { BanUserDialog } from '@/components/Admin/BanDialog'
import { Empty } from '@/components/Empty'
import { Input } from '@/components/Form/Input'
import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/SCN/badge'
import { Button } from '@/components/SCN/button'
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
import { ROUTE_HOME } from '@/lib/constants-routes'
import type { Page } from '@/lib/dto/common'
import { roleSchema, USER_SEARCH_MAX_LENGTH, usersUrlQuery, type AdminUser } from '@/lib/dto/users'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

type AdminViewProps = {
  users: Page<AdminUser>
  /** The signed-in admin: their own row offers no actions. */
  viewerId: string
}

export const AdminView = ({ users, viewerId }: AdminViewProps) => {
  const { state, setState, isPending } = useUrlState(usersUrlQuery)
  // One admin write at a time: every control waits, so changes cannot overlap.
  const [isSaving, setIsSaving] = useState(false)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const q = new FormData(event.currentTarget).get('q')
    setState({ q: typeof q === 'string' ? q.trim() : '', page: 1 })
  }

  const run = async (work: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setIsSaving(true)
    try {
      const result = await work()
      if (!result.ok) {
        toast.error(result.message)
      }
      return result.ok
    } finally {
      setIsSaving(false)
    }
  }

  const handleRole = async (user: AdminUser, value: string) => {
    const role = roleSchema.safeParse(value)
    if (!role.success || role.data === user.role) {
      return
    }
    await run(async () => {
      const result = await setUserRoleAction({ id: user.id, role: role.data })
      if (result.ok) {
        toast.success(
          `${user.name} is now ${role.data === 'admin' ? 'an admin' : 'a regular user'}`,
        )
      }
      return result
    })
  }

  const handleUnban = async (user: AdminUser) => {
    await run(async () => {
      const result = await unbanUserAction(user.id)
      if (result.ok) {
        toast.success(`${user.name} can sign in again`)
      }
      return result
    })
  }

  const handleImpersonate = async (user: AdminUser) => {
    const ok = await run(() => impersonateUserAction(user.id))
    if (ok) {
      // This browser is now signed in as the user, so every layout must be rendered again from
      // scratch: a full navigation, not the client router (the layout shows how to come back).
      window.location.assign(ROUTE_HOME)
    }
  }

  return (
    <div className={styles.view}>
      {/* Remounted when the URL's search changes (back/forward), so the field follows it. */}
      <form key={state.q} className={styles.search} onSubmit={handleSearch} role="search">
        <div className={styles.searchField}>
          <Input
            name="q"
            type="search"
            label="Search users"
            placeholder="Name, username or email"
            defaultValue={state.q}
            maxLength={USER_SEARCH_MAX_LENGTH}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {users.items.length === 0 ? (
        <Empty
          title="No users found"
          description={state.q ? 'No user matches your search.' : 'There are no users yet.'}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.items.map((user) => {
              const isSelf = user.id === viewerId
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className={styles.nameCell}>
                      <span>{user.name}</span>
                      <span className={styles.username}>@{user.username}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.email}{' '}
                    {!user.emailVerified && <Badge variant="outline">Unverified</Badge>}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleRole(user, value)}
                      disabled={isSelf || isSaving}
                    >
                      <SelectTrigger size="sm" aria-label={`Role of ${user.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.banned ? (
                      <Badge variant="destructive" title={user.banReason ?? undefined}>
                        Banned
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>
                    {!isSelf && (
                      <div className={styles.actions}>
                        {user.banned ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isSaving}
                            onClick={() => handleUnban(user)}
                          >
                            Unban
                          </Button>
                        ) : (
                          <BanUserDialog user={user} disabled={isSaving} />
                        )}
                        {user.role !== 'admin' && !user.banned && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isSaving}
                            onClick={() => handleImpersonate(user)}
                          >
                            Impersonate
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Pagination
        page={users.page}
        totalPages={users.totalPages}
        onPageChange={(page) => setState({ page })}
        disabled={isPending}
      />
    </div>
  )
}
