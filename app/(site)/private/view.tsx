'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/SCN/button'
import { Spinner } from '@/components/SCN/spinner'
import { ROUTE_HOME } from '@/lib/constants-routes'
import { useUserStore } from '@/stores/user'
import styles from './styles.module.scss'

export function PrivateView() {
  const router = useRouter()
  const profile = useUserStore((s) => s.profile)
  const hasLoadedProfile = useUserStore((s) => s.hasLoadedProfile)
  const isUserLoading = useUserStore((s) => s.isUserLoading)
  const logout = useUserStore((s) => s.logout)

  const handleLogout = async () => {
    const response = await logout()
    if (!response.success) {
      toast.error(response.message)
      return
    }
    router.refresh()
    router.push(ROUTE_HOME)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>This page is private and requires authentication.</h1>

      {!hasLoadedProfile && <Spinner />}

      {profile && (
        <div className={styles.profile}>
          <p className={styles.meta}>
            <strong>Name:</strong> {profile.user.name}
          </p>
          <p className={styles.meta}>
            <strong>Username:</strong> {profile.user.username}
          </p>
          <p className={styles.meta}>
            <strong>Email:</strong> {profile.user.email}
          </p>
          <div>
            <Button type="button" variant="outline" loading={isUserLoading} onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
