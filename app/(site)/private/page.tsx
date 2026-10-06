import type { Metadata } from 'next'
import { SignOutButton } from '@/components/Auth/SignOutButton'
import { ROUTE_PRIVATE } from '@/lib/constants-routes'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser } from '@/lib/data/users'
import styles from './styles.module.scss'

export const metadata: Metadata = {
  title: 'Private',
}

const PrivatePage = async () => {
  const user = await loadPage(getCurrentUser, ROUTE_PRIVATE)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>This page is private and requires authentication.</h1>
      <div className={styles.profile}>
        <p className={styles.meta}>
          <strong>Name:</strong> {user.name}
        </p>
        <p className={styles.meta}>
          <strong>Username:</strong> {user.username}
        </p>
        <p className={styles.meta}>
          <strong>Email:</strong> {user.email}
        </p>
        <p className={styles.meta}>
          <strong>Role:</strong> {user.role}
        </p>
        <div>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}

export default PrivatePage
