import type { Metadata } from 'next'
import { PrivateView } from './view'

export const metadata: Metadata = {
  title: 'Private',
}

export default function PrivatePage() {
  return <PrivateView />
}
