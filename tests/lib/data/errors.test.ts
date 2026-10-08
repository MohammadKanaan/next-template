// @vitest-environment node
import { redirect } from 'next/navigation'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  parseInput,
  readJsonBody,
  RateLimitedError,
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

  it('maps a conflict to the CONFLICT code', () => {
    expect(toActionFailure(new ConflictError('Reload'))).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'Reload',
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
    expect(redirectError).toBeDefined()
    let rethrown: unknown
    try {
      toActionFailure(redirectError)
    } catch (error) {
      rethrown = error
    }
    expect(rethrown).toBe(redirectError)
  })
})

describe('toErrorResponse', () => {
  it('maps codes to statuses', async () => {
    const cases = [
      [new UnauthorizedError(), 401],
      [new ForbiddenError(), 403],
      [new NotFoundError(), 404],
      [new ValidationError({}), 422],
      [new ConflictError(), 409],
      [new RateLimitedError(), 429],
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

describe('readJsonBody', () => {
  const jsonRequest = (body: string, contentType = 'application/json') => {
    return new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    })
  }

  it('parses a JSON body, whatever its shape', async () => {
    expect(await readJsonBody(jsonRequest('{"a":1}'))).toEqual({ a: 1 })
    expect(await readJsonBody(jsonRequest('[1]'))).toEqual([1])
    expect(await readJsonBody(jsonRequest('null'))).toBeNull()
  })

  it('accepts a charset and any letter case in the content type', async () => {
    expect(await readJsonBody(jsonRequest('{}', 'Application/JSON; charset=utf-8'))).toEqual({})
  })

  it('rejects any other content type, or none, with a ValidationError', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonx']) {
      await expect(readJsonBody(jsonRequest('{}', type))).rejects.toBeInstanceOf(ValidationError)
    }
    const missing = new Request('http://localhost/api', { method: 'POST' })
    await expect(readJsonBody(missing)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Content-Type must be application/json',
    })
  })

  it('maps malformed or empty JSON to a ValidationError', async () => {
    for (const body of ['{"a":', '', 'not json']) {
      await expect(readJsonBody(jsonRequest(body))).rejects.toMatchObject({
        code: 'VALIDATION',
        message: 'The request body is not valid JSON',
        fieldErrors: { base: ['The request body is not valid JSON'] },
      })
    }
  })
})
