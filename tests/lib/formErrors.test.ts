import { describe, expect, it, vi } from 'vitest'
import { applyActionErrors } from '@/lib/formErrors'
import type { ActionFailure } from '@/types/api'

type Values = { title: string; body: string }

const fields = ['title', 'body'] as const

describe('applyActionErrors', () => {
  it('sets the first error on each known field and nothing on root', () => {
    const setError = vi.fn()
    const failure: ActionFailure = {
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { title: ['Title is taken', 'Another'], body: ['Body is required'] },
    }
    applyActionErrors<Values>(failure, fields, setError)
    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenCalledWith('title', { type: 'server', message: 'Title is taken' })
    expect(setError).toHaveBeenCalledWith('body', { type: 'server', message: 'Body is required' })
  })

  it('falls back to root.server when the error is for an unknown field', () => {
    const setError = vi.fn()
    const failure: ActionFailure = {
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { base: ['Provide at least one attribute'] },
    }
    applyActionErrors<Values>(failure, fields, setError)
    expect(setError).toHaveBeenCalledOnce()
    expect(setError).toHaveBeenCalledWith('root.server', {
      type: 'server',
      message: 'Validation failed',
    })
  })

  it('uses the message when there are no field errors', () => {
    const setError = vi.fn()
    applyActionErrors<Values>(
      { ok: false, code: 'FORBIDDEN', message: 'You cannot change this post' },
      fields,
      setError,
    )
    expect(setError).toHaveBeenCalledWith('root.server', {
      type: 'server',
      message: 'You cannot change this post',
    })
  })
})
