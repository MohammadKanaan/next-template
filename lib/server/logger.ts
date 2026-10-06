import 'server-only'
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino'

/** Job payloads and auth errors can carry live reset and verification links and credentials. */
const REDACT_PATHS = [
  'url',
  'token',
  'password',
  '*.url',
  '*.token',
  '*.password',
  'headers.cookie',
  'headers.authorization',
]

type Env = Record<string, string | undefined>

type CreateLoggerOptions = {
  env?: Env
  /** Writes here instead of stdout (and skips the pretty transport); for tests. */
  destination?: DestinationStream
}

function resolveLevel(env: Env) {
  if (env.LOG_LEVEL) {
    return env.LOG_LEVEL
  }
  if (env.NODE_ENV === 'test') {
    return 'silent'
  }
  return env.NODE_ENV === 'production' ? 'info' : 'debug'
}

/**
 * Builds a pino logger. `LOG_LEVEL` wins, else `silent` in test, `debug` in development and `info`
 * in production. Production writes JSON to stdout; development pretty-prints it. `LOG_LEVEL` is
 * read here directly, not through `serverEnv()`, because the logger must work before the
 * environment is validated (e.g. the worker's "DATABASE_URL is required" exit).
 */
export function createLogger({ env = process.env, destination }: CreateLoggerOptions = {}): Logger {
  const options: LoggerOptions = {
    level: resolveLevel(env),
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  }
  if (destination) {
    return pino(options, destination)
  }
  // The worker runs without NODE_ENV in development, so "not production, not test" is development.
  if (env.NODE_ENV !== 'production' && env.NODE_ENV !== 'test') {
    options.transport = { target: 'pino-pretty' }
  }
  return pino(options)
}

export const logger = createLogger()
