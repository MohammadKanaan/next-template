import type { Metadata } from 'next'
import { NO_INDEX } from '@/lib/seo'
import { UiKitView } from './view'

export const metadata: Metadata = {
  title: 'UI Kit',
  description: 'Component catalog for the Next template.',
  // A reference for developers, not content for search results.
  robots: NO_INDEX,
}

const UiKitPage = () => {
  return <UiKitView />
}

export default UiKitPage
