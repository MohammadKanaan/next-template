'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { setUserRoleAction } from '@/actions/users'
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
import type { Page } from '@/lib/dto/common'
import { roleSchema, USER_SEARCH_MAX_LENGTH, usersUrlQuery, type AdminUser } from '@/lib/dto/users'
import { formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

type AdminViewProps = {
  users: Page<AdminUser>
  /** The signed-in admin: their own role cannot be changed here. */
  viewerId: string
}

export function AdminView({ users, viewerId }: AdminViewProps) {
  const { state, setState, isPending } = useUrlState(usersUrlQuery)
  // A role change is in flight: every role select waits, so changes cannot overlap.
  const [isSavingRole, setIsSavingRole] = useState(false)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const q = new FormData(event.currentTarget).get('q')
    setState({ q: typeof q === 'string' ? q.trim() : '', page: 1 })
  }

  const handleRole = async (user: AdminUser, value: string) => {
    const role = roleSchema.safeParse(value)
    if (!role.success || role.data === user.role) {
      return
    }
    setIsSavingRole(true)
    try {
      const result = await setUserRoleAction({ id: user.id, role: role.data })
      if (result.ok) {
        toast.success(
          `${user.name} is now ${role.data === 'admin' ? 'an admin' : 'a regular user'}`,
        )
      } else {
        toast.error(result.message)
      }
    } finally {
      setIsSavingRole(false)
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
              <TableHead>Posts</TableHead>
              <TableHead>Joined</TableHead>
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
                      disabled={isSelf || isSavingRole}
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
                  <TableCell>{user.postCount}</TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
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
