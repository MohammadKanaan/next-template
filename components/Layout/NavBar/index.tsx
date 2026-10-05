'use client'

import clsx from 'clsx'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/SCN/button'
import { useScrollLock } from '@/hooks/useScrollLock'
import { BREAKPOINTS } from '@/lib/constants-breakpoints'
import {
  ROUTE_HOME,
  ROUTE_LOGIN,
  ROUTE_POSTS,
  ROUTE_PRIVATE,
  ROUTE_UI_KIT,
} from '@/lib/constants-routes'
import { env } from '@/lib/env'
import { useUserStore } from '@/stores/user'
import styles from './styles.module.scss'

const MOBILE_NAV_ID = 'mobile-nav'

const NAV_LINKS = [
  { label: 'Posts', href: ROUTE_POSTS },
  { label: 'UI Kit', href: ROUTE_UI_KIT },
  { label: 'Private', href: ROUTE_PRIVATE },
]

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useUserStore((s) => s.user)
  const hasLoadedProfile = useUserStore((s) => s.hasLoadedProfile)
  const isUserLoading = useUserStore((s) => s.isUserLoading)
  const logout = useUserStore((s) => s.logout)
  const { lockScroll, unlockScroll } = useScrollLock()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false)
    unlockScroll()
  }, [unlockScroll])

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      closeMobileMenu()
      return
    }

    setIsMobileMenuOpen(true)
    lockScroll()
  }

  useEffect(() => {
    const handleResize = () => {
      if (window.matchMedia(`(min-width: ${BREAKPOINTS.md})`).matches) {
        closeMobileMenu()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [closeMobileMenu])

  const handleLogout = async () => {
    const response = await logout()
    if (!response.success) {
      toast.error(response.message)
      return
    }
    router.refresh()
    router.push(ROUTE_HOME)
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href={ROUTE_HOME} className={styles.brand}>
          {env.appName}
        </Link>

        <button
          type="button"
          className={styles.mobileMenuButton}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
          aria-controls={MOBILE_NAV_ID}
          onClick={toggleMobileMenu}
        >
          {isMobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <div className={styles.desktopNav}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                styles.navLink,
                isActive(link.href) && styles.navLinkActive,
                'ui-press',
              )}
            >
              <span>{link.label}</span>
            </Link>
          ))}
          <div className={styles.accountArea}>
            {hasLoadedProfile &&
              (user ? (
                <>
                  <span className={styles.userName}>{user.name}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={isUserLoading}
                    onClick={handleLogout}
                  >
                    Log out
                  </Button>
                </>
              ) : (
                <Button asChild size="sm">
                  <Link href={ROUTE_LOGIN}>Log in</Link>
                </Button>
              ))}
          </div>
        </div>

        <div
          className={clsx(styles.mobileNavOverlay, isMobileMenuOpen && styles.active)}
          aria-hidden="true"
          onClick={closeMobileMenu}
        />

        <div
          id={MOBILE_NAV_ID}
          className={clsx(styles.mobileNav, isMobileMenuOpen && styles.active)}
          inert={!isMobileMenuOpen}
        >
          <div className={styles.mobileNavHeader}>{env.appName}</div>
          <div className={styles.mobileNavLinks}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={styles.mobileNavLink}
                onClick={closeMobileMenu}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
