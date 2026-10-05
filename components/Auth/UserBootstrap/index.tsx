'use client'

import { useEffect } from 'react'
import { useUserStore } from '@/stores/user'

/** Loads the signed-in profile once on mount. Renders nothing. */
export function UserBootstrap() {
  const hasLoadedProfile = useUserStore((s) => s.hasLoadedProfile)
  const isUserLoading = useUserStore((s) => s.isUserLoading)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  useEffect(() => {
    if (!hasLoadedProfile && !isUserLoading) {
      void fetchProfile()
    }
  }, [hasLoadedProfile, isUserLoading, fetchProfile])

  return null
}
