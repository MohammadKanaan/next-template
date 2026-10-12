import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cache } from 'react'
import { UserActions } from '@/components/Admin/Users/UserActions'
import { Badge } from '@/components/SCN/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/SCN/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/SCN/table'
import { UserAvatar } from '@/components/UserAvatar'
import { adminUserPath, ROUTE_ADMIN_USERS, ROUTE_POST_DETAILS } from '@/lib/constants-routes'
import { getAdminUser } from '@/lib/data/admin'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser } from '@/lib/data/users'
import { formatDate, formatDateTime } from '@/lib/formatDate'
import styles from './styles.module.scss'

// `generateMetadata` and the page read the same user: one DAL call per request.
const loadUser = cache((id: string) => loadPage(() => getAdminUser(id), adminUserPath(id)))

export const generateMetadata = async ({
  params,
}: PageProps<'/admin/users/[id]'>): Promise<Metadata> => {
  const { id } = await params
  const user = await loadUser(id)
  return { title: `${user.name} · Admin` }
}

const AdminUserPage = async ({ params }: PageProps<'/admin/users/[id]'>) => {
  const { id } = await params
  const [user, viewer] = await Promise.all([loadUser(id), getCurrentUser()])
  const isSelf = user.id === viewer.id

  return (
    <div className={styles.page}>
      <Link href={ROUTE_ADMIN_USERS} className={styles.back}>
        <ArrowLeft aria-hidden="true" />
        All users
      </Link>

      <header className={styles.header}>
        <UserAvatar name={user.name} image={user.image} size="lg" />
        <div className={styles.identity}>
          <h1 className={styles.name}>{user.name}</h1>
          <p className={styles.meta}>
            @{user.username} · {user.email}
          </p>
          <div className={styles.badges}>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
            {user.banned ? (
              <Badge variant="destructive" title={user.banReason ?? undefined}>
                Banned
              </Badge>
            ) : (
              <Badge variant="outline">Active</Badge>
            )}
            {!user.emailVerified && <Badge variant="outline">Unverified email</Badge>}
            {isSelf && <Badge variant="outline">You</Badge>}
          </div>
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Account</h2>
              </CardTitle>
              <CardDescription>
                {isSelf
                  ? 'Your own account: change your role or ban yourself from another admin’s session.'
                  : 'Role, bans and impersonation apply on the user’s next request.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserActions user={user} isSelf={isSelf} extended />
              {user.banned && user.banReason ? (
                <p className={styles.note}>Ban reason: {user.banReason}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Sessions</h2>
              </CardTitle>
              <CardDescription>
                {user.sessions.length === 0
                  ? 'Not signed in anywhere.'
                  : `Signed in on ${user.sessions.length} ${user.sessions.length === 1 ? 'device' : 'devices'}.`}
              </CardDescription>
            </CardHeader>
            {user.sessions.length > 0 && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Signed in</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {user.sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className={styles.userAgent}>
                          {session.userAgent ?? 'Unknown device'}
                        </TableCell>
                        <TableCell className={styles.nowrap}>
                          {formatDateTime(session.createdAt)}
                        </TableCell>
                        <TableCell className={styles.nowrap}>
                          {formatDateTime(session.expiresAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </div>

        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Posts</h2>
              </CardTitle>
              <CardDescription>
                {user.postCount === 0
                  ? 'Has not written any posts.'
                  : `Wrote ${user.postCount} ${user.postCount === 1 ? 'post' : 'posts'}${
                      user.postCount > user.posts.length
                        ? `, the newest ${user.posts.length} below`
                        : ''
                    }.`}
              </CardDescription>
            </CardHeader>
            {user.posts.length > 0 && (
              <CardContent>
                <ul className={styles.posts}>
                  {user.posts.map((post) => (
                    <li key={post.id}>
                      <Link href={ROUTE_POST_DETAILS(post.id)} className={styles.post}>
                        <span className={styles.postTitle}>{post.title}</span>
                        <span className={styles.postDate}>
                          {post.published ? formatDate(post.createdAt) : 'Draft'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className={styles.facts}>
                <div>
                  <dt>Joined</dt>
                  <dd>{formatDateTime(user.createdAt)}</dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(user.updatedAt)}</dd>
                </div>
                <div>
                  <dt>User id</dt>
                  <dd>
                    <code>{user.id}</code>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AdminUserPage
