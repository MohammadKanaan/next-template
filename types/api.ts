import type { ErrorBody } from '@/lib/dto/errors'

export type { ErrorBody, ErrorCode, FieldErrors } from '@/lib/dto/errors'

export type ActionFailure = { ok: false } & ErrorBody

export type ActionResult<T> = { ok: true; data: T } | ActionFailure
