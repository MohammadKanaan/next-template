import type { Metadata } from 'next'
import { UiKitView } from './view'

export const metadata: Metadata = {
  title: 'UI Kit',
  description: 'Component catalog for the Next template.',
}

const UiKitPage = () => {
  return <UiKitView />
}

export default UiKitPage
