import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { ROUTE_HOME } from '@/lib/constants-routes'
import { siteUrl } from '@/lib/data/site'
import { SITE_DESCRIPTION } from '@/lib/seo'
import { websiteJsonLd } from '@/lib/structuredData'
import styles from './home.module.scss'

export const metadata: Metadata = {
  alternates: { canonical: ROUTE_HOME },
}

const HomePage = () => {
  return (
    <section className={styles.landing}>
      <JsonLd data={websiteJsonLd(siteUrl())} />
      <h1>Welcome</h1>
      <p>{SITE_DESCRIPTION}</p>
    </section>
  )
}

export default HomePage
