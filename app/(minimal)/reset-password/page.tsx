import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageLoading } from '@/components/PageLoading'
import { ResetPasswordView } from './view'

export const metadata: Metadata = {
  title: 'Reset password',
}

type ResetPasswordSearch = Pick<PageProps<'/reset-password'>, 'searchParams'>

async function ResetPasswordContent({ searchParams }: ResetPasswordSearch) {
  const { token, error } = await searchParams
  // Better Auth sends `?error=INVALID_TOKEN` for an unknown or expired link, `?token=` otherwise.
  const validToken = typeof token === 'string' && token && !error ? token : null

  return <ResetPasswordView token={validToken} />
}

export default function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ResetPasswordContent searchParams={searchParams} />
    </Suspense>
  )
}
