import { Home } from 'lucide-react'
import { ButtonLink } from '@/components/ButtonLink'
import { Empty } from '@/components/Empty'
import { ROUTE_HOME } from '@/lib/constants-routes'
import styles from './not-found.module.scss'

const NotFound = () => {
  return (
    <div className={styles.container}>
      <Empty
        title="Page not found"
        description="The page you are looking for does not exist."
        action={
          <ButtonLink href={ROUTE_HOME}>
            <Home data-icon="inline-start" aria-hidden="true" />
            Go home
          </ButtonLink>
        }
      />
    </div>
  )
}

export default NotFound
