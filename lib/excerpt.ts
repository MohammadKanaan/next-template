/**
 * Cuts `text` so the result is at most `max` UTF-16 units (what Zod's `.max` counts), ending in an
 * ellipsis when it was shortened and trailing whitespace is trimmed before it. Text is cut by code
 * point, so an emoji is never split into a lone surrogate (which renders as U+FFFD).
 */
export const toExcerpt = (text: string, max: number): string => {
  if (text.length <= max) {
    return text
  }
  const characters = Array.from(text).slice(0, Math.max(max - 1, 0))
  while (characters.join('').length > max - 1) {
    characters.pop()
  }
  return `${characters.join('').trimEnd()}…`
}
