import 'server-only'

/** Prisma's `contains` does not escape LIKE wildcards; a search for "100%" must not match everything. */
export const escapeLike = (value: string) => {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}
