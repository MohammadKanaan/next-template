import { z } from 'zod'
import type { QueueOptions } from 'pg-boss'

const emailAddress = z.email()

/** Which template to render and the props it takes; one member per file in `emails/`. */
export const sendEmailPayload = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('verify-email'),
    to: emailAddress,
    props: z.object({ name: z.string(), url: z.url() }),
  }),
  z.object({
    template: z.literal('reset-password'),
    to: emailAddress,
    props: z.object({ name: z.string(), url: z.url() }),
  }),
  z.object({
    template: z.literal('confirm-email-change'),
    to: emailAddress,
    props: z.object({ name: z.string(), newEmail: emailAddress, url: z.url() }),
  }),
])

export type JobDefinition = {
  schema: z.ZodType
  /** Queue defaults (retries, backoff, expiry); applied when the worker creates the queue. */
  options?: QueueOptions
  /** Cron expression; the worker schedules the job on it. */
  cron?: string
}

/**
 * Every background job: its name, the payload schema (shared by `enqueue` and the handler) and its
 * queue options. To add one, add it here, write a handler in `jobs/`, and register it in
 * `worker/index.ts`.
 */
export const jobs = {
  'send-email': {
    schema: sendEmailPayload,
    options: {
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 60,
      // The payload carries live reset and verification links that expire after an hour, so
      // completed jobs must not keep them for pg-boss's 7-day default.
      deleteAfterSeconds: 3600,
    },
  },
  'delete-object': {
    schema: z.object({ key: z.string().min(1) }),
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 60 },
  },
  cleanup: {
    schema: z.object({}),
    options: { retryLimit: 1, expireInSeconds: 300 },
    cron: '0 * * * *',
  },
} satisfies Record<string, JobDefinition>

export type JobName = keyof typeof jobs

export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]['schema']>
