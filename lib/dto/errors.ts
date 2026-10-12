import { z } from 'zod'

export const fieldErrorsSchema = z.record(z.string(), z.array(z.string()))

export const errorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'RATE_LIMITED',
])

/** Error JSON from Route Handlers; the same fields a failed Server Action returns. */
export const errorBodySchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  fieldErrors: fieldErrorsSchema.optional(),
})

export type FieldErrors = z.infer<typeof fieldErrorsSchema>
export type ErrorCode = z.infer<typeof errorCodeSchema>
export type ErrorBody = z.infer<typeof errorBodySchema>
