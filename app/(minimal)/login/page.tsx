import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { safeRedirectPath } from '@/lib/constants-routes'
import { getViewer } from '@/lib/data/users'
import { LoginView } from './view'

export const metadata: Metadata = {
  title: 'Log in',
}

type LoginSearch = Pick<PageProps<'/login'>, 'searchParams'>

async function LoginContent({ searchParams }: LoginSearch) {
  const { next } = await searchParams
  const nextPath = safeRedirectPath(typeof next === 'string' ? next : undefined)

  // A real session (not just a cookie) has nothing to do here.
  if (await getViewer()) {
    redirect(nextPath)
  }

  return <LoginView nextPath={nextPath} />
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  )
}
