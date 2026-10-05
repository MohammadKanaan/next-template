export type FieldErrors = Record<string, string[]>

export type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION'

/** Error JSON from Route Handlers; the same fields a failed Server Action returns. */
export type ErrorBody = {
  code: ErrorCode
  message: string
  fieldErrors?: FieldErrors
}

export type ActionFailure = { ok: false } & ErrorBody

export type ActionResult<T> = { ok: true; data: T } | ActionFailure
