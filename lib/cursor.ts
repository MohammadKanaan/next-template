/** Client-safe: a cursor is the id of the last item a page returned, as opaque base64url text. */

const MAX_CURSOR_ID = 2147483647

export const encodeCursor = (id: number): string => {
  return btoa(String(id)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The id inside a cursor, or `null` when the value is not one `encodeCursor` could have made. */
export const decodeCursor = (value: string): number | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null
  }
  let text: string
  try {
    text = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return null
  }
  if (!/^[1-9][0-9]*$/.test(text)) {
    return null
  }
  const id = Number(text)
  return id <= MAX_CURSOR_ID ? id : null
}
