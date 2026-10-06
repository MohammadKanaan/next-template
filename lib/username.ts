const USERNAME_MAX_LENGTH = 30
const SUFFIX_LENGTH = 6
const FALLBACK_BASE = 'user'
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Random lowercase letters and digits; collisions are a 1 in 36^6 chance per shared base. */
const randomSuffix = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH))
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
}

/**
 * A username for an account created without one (social sign-in). Every result passes the sign-up
 * username rule (`signUpInput.shape.username`: 3-30 characters of `a-z`, `0-9`, `_`). It is the
 * email's local part reduced to that alphabet, trimmed so the whole value fits, plus a random
 * suffix so two people with the same local part do not collide. Users can rename themselves in
 * settings. `suffix` is injectable for tests.
 */
export const deriveUsername = (email: string, suffix: string = randomSuffix()): string => {
  const atIndex = email.lastIndexOf('@')
  const localPart = atIndex === -1 ? email : email.slice(0, atIndex)
  const base =
    localPart
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, USERNAME_MAX_LENGTH - SUFFIX_LENGTH - 1)
      .replace(/_+$/g, '') || FALLBACK_BASE
  return `${base}_${suffix}`
}
