'use client'

import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { AdminSidebar } from '@/components/Admin/Shell/AdminSidebar'
import { ButtonLink } from '@/components/ButtonLink'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PINNED_THEME } from '@/lib/constants-theme'
import { ROUTE_HOME } from '@/lib/constants-routes'
import type { CurrentUser } from '@/lib/dto/users'
import styles from './styles.module.scss'

type AdminShellProps = {
  viewer: CurrentUser
  /** The sidebar's last state, from its cookie, so the server renders it the way it was left. */
  defaultOpen: boolean
  /** The server-rendered page. */
  children: ReactNode
}

/** The dashboard's frame: the sidebar, a top bar with its toggle and a way back to the site, the page. */
export const AdminShell = ({ viewer, defaultOpen, children }: AdminShellProps) => {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar viewer={viewer} />
      <SidebarInset>
        <header className={styles.topBar}>
          <div className={styles.topBarStart}>
            <SidebarTrigger />
            <Separator orientation="vertical" />
            <span className={styles.topBarTitle}>Admin</span>
          </div>
          <div className={styles.topBarEnd}>
            <ButtonLink href={ROUTE_HOME} variant="ghost" size="sm">
              View site
              <ExternalLink data-icon="inline-end" aria-hidden="true" />
            </ButtonLink>
            {PINNED_THEME === null && <ThemeToggle />}
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
