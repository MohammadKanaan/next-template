// @vitest-environment node
import { redirect } from 'next/navigation'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ForbiddenError,
  NotFoundError,
  parseInput,
  toActionFailure,
  toErrorResponse,
  UnauthorizedError,
  ValidationError,
} from '@/lib/data/errors'

describe('parseInput', () => {
  it('returns parsed data or throws field errors', () => {
    const schema = z.object({ title: z.string().trim().min(1, 'Title is required') })
    expect(parseInput(schema, { title: ' a ' })).toEqual({ title: 'a' })
    try {
      parseInput(schema, { title: ' ' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).fieldErrors).toEqual({ title: ['Title is required'] })
    }
  })
})

describe('toActionFailure', () => {
  it('maps typed errors to a failed result', () => {
    expect(toActionFailure(new ForbiddenError('No'))).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'No',
    })
    expect(toActionFailure(new ValidationError({ body: ['Body is required'] }))).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Validation failed',
      fieldErrors: { body: ['Body is required'] },
    })
  })

  it('rethrows unknown errors and Next redirects', () => {
    expect(() => toActionFailure(new Error('boom'))).toThrow('boom')
    let redirectError: unknown
    try {
      redirect('/login')
    } catch (error) {
      redirectError = error
    }
    expect(() => toActionFailure(redirectError)).toThrow()
  })
})

describe('toErrorResponse', () => {
  it('maps codes to statuses', async () => {
    const cases = [
      [new UnauthorizedError(), 401],
      [new ForbiddenError(), 403],
      [new NotFoundError(), 404],
      [new ValidationError({}), 422],
    ] as const
    for (const [error, status] of cases) {
      const response = toErrorResponse(error)
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ code: error.code, message: error.message })
    }
  })

  it('rethrows unknown errors', () => {
    expect(() => toErrorResponse(new Error('boom'))).toThrow('boom')
  })
})
