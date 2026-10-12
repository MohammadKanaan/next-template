import type { ReactNode } from 'react'
import styles from './styles.module.scss'

type SettingsSectionProps = {
  /** The anchor `SettingsNav` links to. */
  id: string
  title: string
  description: ReactNode
  /** Marks a destructive section (the title turns red). */
  danger?: boolean
  children: ReactNode
}

/** One settings row: its title and description beside the form (above it on narrower screens). */
export const SettingsSection = ({
  id,
  title,
  description,
  danger,
  children,
}: SettingsSectionProps) => {
  const titleId = `${id}-title`

  return (
    <section
      id={id}
      className={styles.section}
      data-danger={danger || undefined}
      aria-labelledby={titleId}
    >
      <div className={styles.text}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
