import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStorage, removeStorage, subscribeStorage, writeStorage } from '@/lib/browserStorage'

describe('browserStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('reads, writes and removes a value', () => {
    expect(readStorage('localStorage', 'k')).toBeNull()
    expect(writeStorage('localStorage', 'k', 'v')).toBe(true)
    expect(readStorage('localStorage', 'k')).toBe('v')
    expect(localStorage.getItem('k')).toBe('v')
    removeStorage('localStorage', 'k')
    expect(readStorage('localStorage', 'k')).toBeNull()
  })

  it('keeps the two storage areas apart', () => {
    writeStorage('sessionStorage', 'k', 'session')
    expect(readStorage('localStorage', 'k')).toBeNull()
    expect(readStorage('sessionStorage', 'k')).toBe('session')
  })

  it('reads as null when the browser throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readStorage('localStorage', 'k')).toBeNull()
  })

  it('reports a failed write (quota, private mode) instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const onChange = vi.fn()
    subscribeStorage('localStorage', 'k', onChange)
    expect(writeStorage('localStorage', 'k', 'v')).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not throw when removing fails', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => removeStorage('localStorage', 'k')).not.toThrow()
  })

  it('tells subscribers about writes and removals in this tab', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeStorage('localStorage', 'k', onChange)
    writeStorage('localStorage', 'k', 'v')
    removeStorage('localStorage', 'k')
    expect(onChange).toHaveBeenCalledTimes(2)
    unsubscribe()
    writeStorage('localStorage', 'k', 'again')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys and the other area', () => {
    const onChange = vi.fn()
    subscribeStorage('localStorage', 'k', onChange)
    writeStorage('localStorage', 'other', 'v')
    writeStorage('sessionStorage', 'k', 'v')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('tells subscribers about changes from another tab', () => {
    const onChange = vi.fn()
    subscribeStorage('localStorage', 'k', onChange)
    window.dispatchEvent(new StorageEvent('storage', { key: 'k', storageArea: localStorage }))
    expect(onChange).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', storageArea: localStorage }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'k', storageArea: sessionStorage }))
    expect(onChange).toHaveBeenCalledTimes(1)
    // `key: null` means the whole storage was cleared.
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }))
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
