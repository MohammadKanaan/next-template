import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { safeRedirectPath } from '@/lib/constants-routes'
import { getViewer } from '@/lib/data/users'
import { SignUpView } from './view'

export const metadata: Metadata = {
  title: 'Sign up',
}

export default async function SignUpPage({ searchParams }: PageProps<'/signup'>) {
  const { next } = await searchParams
  const nextPath = safeRedirectPath(typeof next === 'string' ? next : undefined)

  // A real session (not just a cookie) has nothing to do here.
  if (await getViewer()) {
    redirect(nextPath)
  }

  return <SignUpView nextPath={nextPath} />
}
