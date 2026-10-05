import type { Metadata } from 'next'
import { safeRedirectPath } from '@/lib/constants-routes'
import { SignUpView } from './view'

export const metadata: Metadata = {
  title: 'Sign up',
}

export default async function SignUpPage({ searchParams }: PageProps<'/signup'>) {
  const { next } = await searchParams
  const nextPath = safeRedirectPath(typeof next === 'string' ? next : undefined)

  return <SignUpView nextPath={nextPath} />
}
