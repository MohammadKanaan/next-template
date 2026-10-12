'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { UserActions } from '@/components/Admin/Users/UserActions'
import { SortableTableHead } from '@/components/Admin/SortableTableHead'
import { Empty } from '@/components/Empty'
import { Input } from '@/components/Form/Input'
import { Pagination } from '@/components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUrlState } from '@/hooks/useUrlState'
import { adminUserPath } from '@/lib/constants-routes'
import type { Page } from '@/lib/dto/common'
import {
  roleSchema,
  USER_SEARCH_MAX_LENGTH,
  usersUrlQuery,
  userStatusSchema,
  type AdminUser,
  type Role,
  type UserStatus,
} from '@/lib/dto/users'
import { formatDate } from '@/lib/formatDate'
import { ROLE_FILTER_LABELS, ROLE_FILTERS, STATUS_FILTER_LABELS, STATUS_FILTERS } from '../roles'
import styles from './styles.module.scss'

type UsersViewProps = {
  users: Page<AdminUser>
  /** The signed-in admin: their own row offers no actions. */
  viewerId: string
}

const toRoleFilter = (value: string | null): Role | '' => {
  const role = roleSchema.safeParse(value)
  return role.success ? role.data : ''
}

const toStatusFilter = (value: string | null): UserStatus | '' => {
  const status = userStatusSchema.safeParse(value)
  return status.success ? status.data : ''
}

/** The user list: search and filters in the URL, one admin write at a time across the rows. */
export const UsersView = ({ users, viewerId }: UsersViewProps) => {
  const { state, setState, isPending } = useUrlState(usersUrlQuery)
  // One admin write at a time: every row waits, so changes cannot overlap.
  const [isSaving, setIsSaving] = useState(false)
  const isFiltered = Boolean(state.q || state.role || state.status)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const q = new FormData(event.currentTarget).get('q')
    setState({ q: typeof q === 'string' ? q.trim() : '', page: 1 })
  }

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        {/* Remounted when the URL's search changes (back/forward), so the field follows it. */}
        <form
          key={state.q}
          className={styles.search}
          onSubmit={handleSearch}
          role="search"
          aria-label="Users"
        >
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
          <Button type="submit" variant="secondary" size="icon" aria-label="Search">
            <Search aria-hidden="true" />
          </Button>
        </form>
        <div className={styles.filters}>
          <Select
            items={ROLE_FILTER_LABELS}
            value={state.role}
            onValueChange={(value) => setState({ role: toRoleFilter(value), page: 1 })}
          >
            <SelectTrigger aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_FILTERS.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_FILTER_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={STATUS_FILTER_LABELS}
            value={state.status}
            onValueChange={(value) => setState({ status: toStatusFilter(value), page: 1 })}
          >
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_FILTER_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setState({ q: '', role: '', status: '', page: 1 })}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {users.items.length === 0 ? (
        <Empty
          title="No users found"
          description={isFiltered ? 'No user matches your filters.' : 'There are no users yet.'}
        />
      ) : (
        <div className={styles.tableWrap} aria-busy={isPending || undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  direction={state.sortBy === 'name' ? state.direction : undefined}
                  onSort={(direction) => setState({ sortBy: 'name', direction, page: 1 })}
                >
                  Name
                </SortableTableHead>
                <SortableTableHead
                  className={styles.secondary}
                  direction={state.sortBy === 'email' ? state.direction : undefined}
                  onSort={(direction) => setState({ sortBy: 'email', direction, page: 1 })}
                >
                  Email
                </SortableTableHead>
                <SortableTableHead
                  className={styles.secondary}
                  direction={state.sortBy === 'role' ? state.direction : undefined}
                  onSort={(direction) => setState({ sortBy: 'role', direction, page: 1 })}
                >
                  Role
                </SortableTableHead>
                <SortableTableHead
                  direction={state.sortBy === 'banned' ? state.direction : undefined}
                  onSort={(direction) => setState({ sortBy: 'banned', direction, page: 1 })}
                >
                  Status
                </SortableTableHead>
                <SortableTableHead
                  className={styles.secondary}
                  direction={state.sortBy === 'createdAt' ? state.direction : undefined}
                  onSort={(direction) => setState({ sortBy: 'createdAt', direction, page: 1 })}
                >
                  Joined
                </SortableTableHead>
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
                        <Link href={adminUserPath(user.id)} className={styles.nameLink}>
                          {user.name}
                        </Link>
                        <span className={styles.username}>@{user.username}</span>
                      </div>
                    </TableCell>
                    <TableCell className={styles.secondary}>
                      <div className={styles.emailCell}>
                        <span>{user.email}</span>
                        {!user.emailVerified && <Badge variant="outline">Unverified</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={styles.secondary}>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive" title={user.banReason ?? undefined}>
                          Banned
                        </Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className={clsx(styles.nowrap, styles.secondary)}>
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <UserActions
                        user={user}
                        isSelf={isSelf}
                        disabled={isSaving}
                        onBusy={setIsSaving}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {users.totalPages > 1 && (
        <Pagination
          page={users.page}
          totalPages={users.totalPages}
          onPageChange={(page) => setState({ page })}
          disabled={isPending}
        />
      )}
    </div>
  )
}
