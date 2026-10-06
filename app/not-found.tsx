import Link from 'next/link'
import { Empty } from '@/components/Empty'
import { Button } from '@/components/SCN/button'
import { ROUTE_HOME } from '@/lib/constants-routes'
import styles from './not-found.module.scss'

const NotFound = () => {
  return (
    <div className={styles.container}>
      <Empty
        title="Page not found"
        description="The page you are looking for does not exist."
        action={
          <Button asChild>
            <Link href={ROUTE_HOME}>Go home</Link>
          </Button>
        }
      />
    </div>
  )
}

export default NotFound
