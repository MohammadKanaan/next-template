import type { Metadata } from 'next'
import { safeRedirectPath } from '@/lib/constants-routes'
import { LoginView } from './view'

export const metadata: Metadata = {
  title: 'Log in',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams
  const nextPath = safeRedirectPath(typeof next === 'string' ? next : undefined)

  return <LoginView nextPath={nextPath} />
}
