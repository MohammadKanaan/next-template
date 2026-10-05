import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { safeRedirectPath } from '@/lib/constants-routes'
import { getViewer } from '@/lib/data/users'
import { SignUpView } from './view'

export const metadata: Metadata = {
  title: 'Sign up',
}

type SignUpSearch = Pick<PageProps<'/signup'>, 'searchParams'>

async function SignUpContent({ searchParams }: SignUpSearch) {
  const { next } = await searchParams
  const nextPath = safeRedirectPath(typeof next === 'string' ? next : undefined)

  // A real session (not just a cookie) has nothing to do here.
  if (await getViewer()) {
    redirect(nextPath)
  }

  return <SignUpView nextPath={nextPath} />
}

export default function SignUpPage({ searchParams }: PageProps<'/signup'>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SignUpContent searchParams={searchParams} />
    </Suspense>
  )
}
