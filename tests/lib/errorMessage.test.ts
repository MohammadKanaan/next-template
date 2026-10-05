import { describe, expect, it } from 'vitest'
import { NETWORK_ERROR_MESSAGE, humanizeErrorMessage } from '@/lib/errorMessage'

describe('humanizeErrorMessage', () => {
  it('passes empty values through', () => {
    expect(humanizeErrorMessage(undefined)).toBeUndefined()
  })

  it('replaces transport failures with friendly copy', () => {
    expect(humanizeErrorMessage('Network Error')).toBe(NETWORK_ERROR_MESSAGE)
    expect(humanizeErrorMessage('Failed to fetch')).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('strips a request prefix', () => {
    expect(humanizeErrorMessage('[GET] "https://x/api": 404 Not Found')).toBe('404 Not Found')
  })
})
