import { describe, expect, it } from 'vitest'
import { toScalarParams } from '@/lib/searchParams'

describe('toScalarParams', () => {
  it('passes single values through', () => {
    expect(toScalarParams({ q: 'cats', page: '2' })).toEqual({ q: 'cats', page: '2' })
    expect(toScalarParams(new URLSearchParams('q=cats&page=2'))).toEqual({ q: 'cats', page: '2' })
  })

  it('takes the last value of a repeated key, on the server record and on URLSearchParams alike', () => {
    expect(toScalarParams({ q: ['a', 'b'] })).toEqual({ q: 'b' })
    expect(toScalarParams(new URLSearchParams('q=a&q=b'))).toEqual({ q: 'b' })
  })

  it('drops keys without a value', () => {
    expect(toScalarParams({ q: undefined, page: '1', sort: [] })).toEqual({ page: '1' })
  })

  it('keeps an empty value', () => {
    expect(toScalarParams({ q: '' })).toEqual({ q: '' })
  })
})
