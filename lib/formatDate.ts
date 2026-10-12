const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

/**
 * "Oct 5, 2026, 3:04 PM UTC". Fixed locale and time zone so a Server Component's HTML and the
 * client's hydration render the same text, whatever each side's locale or zone is.
 */
export const formatDateTime = (date: Date) => {
  return `${dateTimeFormat.format(date)} UTC`
}

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

/**
 * "Mar 1, 2024": a calendar day (a `@db.Date` column), which the database stores as midnight UTC,
 * so it is read in UTC too (a viewer west of Greenwich would otherwise see the day before).
 */
export const formatDate = (date: Date) => {
  return dateFormat.format(date)
}
