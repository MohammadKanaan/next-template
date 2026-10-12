import { cookies } from 'next/headers'
import { AdminShell } from '@/components/Admin/Shell/AdminShell'
import { ROUTE_ADMIN } from '@/lib/constants-routes'
import { requireAdmin } from '@/lib/data/auth'
import { loadPage } from '@/lib/data/page'
import { getCurrentUser } from '@/lib/data/users'

/** The cookie shadcn's sidebar writes when it is toggled; read so the server renders it as it was left. */
const SIDEBAR_COOKIE = 'sidebar_state'

/**
 * The dashboard's frame. Signed out → login (back to `/admin`), not an admin → the not-found page,
 * as the old admin page did. A convenience, not the guard: every page below reads admin-only DAL
 * functions, which enforce the rule themselves.
 */
const AdminLayout = async ({ children }: LayoutProps<'/'>) => {
  const [viewer, cookieStore] = await Promise.all([
    loadPage(async () => {
      await requireAdmin()
      return getCurrentUser()
    }, ROUTE_ADMIN),
    cookies(),
  ])
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== 'false'

  return (
    <AdminShell viewer={viewer} defaultOpen={defaultOpen}>
      {children}
    </AdminShell>
  )
}

export default AdminLayout
