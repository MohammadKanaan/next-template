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

/**
 * `pino-pretty` is a devDependency, so it may only be loaded where devDependencies exist: under
 * `next dev` and `bun run dev:worker`, which both set NODE_ENV=development. Anything else (tests,
 * production, a plain `bun run worker`) writes JSON.
 */
export const usesPrettyTransport = (env: Env) => {
  return env.NODE_ENV === 'development'
}

type CreateLoggerOptions = {
  env?: Env
  /** Writes here instead of stdout (and skips the pretty transport); for tests. */
  destination?: DestinationStream
}

const resolveLevel = (env: Env) => {
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
export const createLogger = ({
  env = process.env,
  destination,
}: CreateLoggerOptions = {}): Logger => {
  const options: LoggerOptions = {
    level: resolveLevel(env),
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  }
  if (destination) {
    return pino(options, destination)
  }
  if (usesPrettyTransport(env)) {
    options.transport = { target: 'pino-pretty' }
  }
  return pino(options)
}

export const logger = createLogger()
