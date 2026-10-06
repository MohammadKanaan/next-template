import 'server-only'

/** Prisma's `contains` does not escape LIKE wildcards; a search for "100%" must not match everything. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}
