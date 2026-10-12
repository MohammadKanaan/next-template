import type { Metadata } from 'next'
import { NO_INDEX } from '@/lib/seo'
import styles from './styles.module.scss'

// Sign-in, sign-up and password pages have nothing to find in search results.
export const metadata: Metadata = {
  robots: NO_INDEX,
}

const MinimalLayout = ({ children }: LayoutProps<'/'>) => {
  return <div className={styles.minimalContent}>{children}</div>
}

export default MinimalLayout
