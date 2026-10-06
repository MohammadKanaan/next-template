const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

/**
 * "Oct 5, 2026, 3:04 PM UTC". Fixed locale and time zone so a Server Component's HTML and the
 * client's hydration render the same text, whatever each side's locale or zone is.
 */
export function formatDateTime(date: Date) {
  return `${dateTimeFormat.format(date)} UTC`
}
