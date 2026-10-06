import 'server-only'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import type { ActionFailure, ErrorBody, ErrorCode, FieldErrors } from '@/types/api'

/** Base for the errors the DAL throws; callers translate them per transport. */
export class DataError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class UnauthorizedError extends DataError {
  constructor(message = 'Sign in to continue') {
    super('UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends DataError {
  constructor(message = 'You are not allowed to do that') {
    super('FORBIDDEN', message)
  }
}

export class NotFoundError extends DataError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message)
  }
}

export class ValidationError extends DataError {
  constructor(fieldErrors: FieldErrors, message = 'Validation failed') {
    super('VALIDATION', message, fieldErrors)
  }
}

export class RateLimitedError extends DataError {
  constructor(message = 'Too many attempts. Try again in a minute.') {
    super('RATE_LIMITED', message)
  }
}

export const fieldErrorsFrom = (error: z.ZodError): FieldErrors => {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'base'
    ;(errors[field] ??= []).push(issue.message)
  }
  return errors
}

/** `safeParse` that throws a `ValidationError` carrying per-field messages. */
export const parseInput = <S extends z.ZodType>(schema: S, input: unknown): z.output<S> => {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ValidationError(fieldErrorsFrom(result.error))
  }
  return result.data
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  RATE_LIMITED: 429,
}

const toErrorBody = (error: DataError): ErrorBody => {
  return error.fieldErrors
    ? { code: error.code, message: error.message, fieldErrors: error.fieldErrors }
    : { code: error.code, message: error.message }
}

/**
 * Server Actions: a typed DAL error becomes a failed result; anything else (including Next's
 * redirect and not-found errors) is rethrown untouched.
 */
export const toActionFailure = (error: unknown): ActionFailure => {
  if (error instanceof DataError) {
    return { ok: false, ...toErrorBody(error) }
  }
  throw error
}

/** Route Handlers: a typed DAL error becomes its status code; anything else propagates (500). */
export const toErrorResponse = (error: unknown) => {
  if (error instanceof DataError) {
    return NextResponse.json(toErrorBody(error), { status: STATUS_BY_CODE[error.code] })
  }
  throw error
}

/**
 * Reads a Route Handler's JSON body. The content type must be `application/json` (a cross-site
 * form cannot send it without a CORS preflight, which with a `SameSite=Lax` session cookie is what
 * keeps these endpoints safe from CSRF), and a body that is empty or not JSON is a
 * `ValidationError`. The result is `unknown` on purpose: the DAL function that receives it
 * validates its shape.
 */
export const readJsonBody = async (request: Request): Promise<unknown> => {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    const message = 'Content-Type must be application/json'
    throw new ValidationError({ base: [message] }, message)
  }
  try {
    return await request.json()
  } catch {
    const message = 'The request body is not valid JSON'
    throw new ValidationError({ base: [message] }, message)
  }
}
