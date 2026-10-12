import { z } from 'zod'

export const healthCheckSchema = z.enum(['ok', 'fail'])

/** Public dependency probe: never includes errors or connection details. */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({ db: healthCheckSchema, redis: healthCheckSchema }),
})

export type HealthCheck = z.infer<typeof healthCheckSchema>
export type Health = z.infer<typeof healthSchema>
