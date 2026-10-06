/**
 * Guarded access to `localStorage` / `sessionStorage`. Reads and writes swallow the errors the
 * browser throws (private mode, blocked site data, a full quota, no `window` on the server), so a
 * caller falls back to "nothing stored" instead of crashing. `subscribeStorage` reports changes
 * made in other tabs (the `storage` event) and in this one (a custom event, since the browser does
 * not fire `storage` in the tab that wrote).
 */

export type StorageArea = 'localStorage' | 'sessionStorage'

const CHANGE_EVENT = 'browser-storage-change'

type ChangeDetail = { area: StorageArea; key: string }

const getArea = (area: StorageArea): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window[area]
  } catch {
    return null
  }
}

export const readStorage = (area: StorageArea, key: string): string | null => {
  try {
    return getArea(area)?.getItem(key) ?? null
  } catch {
    return null
  }
}

const notify = (area: StorageArea, key: string) => {
  window.dispatchEvent(new CustomEvent<ChangeDetail>(CHANGE_EVENT, { detail: { area, key } }))
}

/** Returns false when the value could not be stored. */
export const writeStorage = (area: StorageArea, key: string, value: string): boolean => {
  try {
    const storage = getArea(area)
    if (!storage) {
      return false
    }
    storage.setItem(key, value)
  } catch {
    return false
  }
  notify(area, key)
  return true
}

export const removeStorage = (area: StorageArea, key: string): void => {
  try {
    const storage = getArea(area)
    if (!storage) {
      return
    }
    storage.removeItem(key)
  } catch {
    return
  }
  notify(area, key)
}

/** Calls `onChange` when `key` changes in this tab or any other; returns the unsubscribe. */
export const subscribeStorage = (area: StorageArea, key: string, onChange: () => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const onStorage = (event: StorageEvent) => {
    // `key` is null when the whole storage was cleared.
    if (event.storageArea === getArea(area) && (event.key === null || event.key === key)) {
      onChange()
    }
  }
  const onLocalChange = (event: Event) => {
    const detail = (event as CustomEvent<ChangeDetail>).detail
    if (detail.area === area && detail.key === key) {
      onChange()
    }
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onLocalChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onLocalChange)
  }
}
