const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** A file size for people: `512 B`, `1.5 KB`, `10 MB` (binary units, one decimal when it helps). */
export const formatBytes = (bytes: number) => {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const text = unit === 0 || Number.isInteger(value) ? String(value) : value.toFixed(1)
  return `${text} ${UNITS[unit]}`
}
