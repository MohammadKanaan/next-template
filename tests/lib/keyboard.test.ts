import { describe, expect, it } from 'vitest'
import { isApplePlatform, isTypingTarget } from '@/lib/keyboard'

describe('isTypingTarget', () => {
  it('is true for fields the visitor types into', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
  })

  it('is false for anything else', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isApplePlatform', () => {
  it('knows Apple platforms by name', () => {
    expect(isApplePlatform('MacIntel')).toBe(true)
    expect(isApplePlatform('macOS')).toBe(true)
    expect(isApplePlatform('iPhone')).toBe(true)
    expect(isApplePlatform('Win32')).toBe(false)
    expect(isApplePlatform('Linux x86_64')).toBe(false)
  })
})
