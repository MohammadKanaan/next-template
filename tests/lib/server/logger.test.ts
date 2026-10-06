// @vitest-environment node
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger, logger, usesPrettyTransport } from '@/lib/server/logger'

function capture() {
  const lines: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk))
      done()
    },
  })
  return { destination, entries: () => lines.map((line) => JSON.parse(line)) }
}

describe('createLogger level', () => {
  it('is silent in test, debug in development and info in production', () => {
    const { destination } = capture()
    expect(createLogger({ env: { NODE_ENV: 'test' }, destination }).level).toBe('silent')
    expect(createLogger({ env: { NODE_ENV: 'development' }, destination }).level).toBe('debug')
    expect(createLogger({ env: { NODE_ENV: 'production' }, destination }).level).toBe('info')
  })

  it('lets LOG_LEVEL win over the environment default', () => {
    const { destination } = capture()
    const env = { NODE_ENV: 'production', LOG_LEVEL: 'warn' }
    expect(createLogger({ env, destination }).level).toBe('warn')
    expect(createLogger({ env: { NODE_ENV: 'test', LOG_LEVEL: 'debug' }, destination }).level).toBe(
      'debug',
    )
  })

  it('exports a default logger that is silent under test', () => {
    expect(logger.level).toBe('silent')
  })
})

describe('usesPrettyTransport', () => {
  it('is only on in development, where devDependencies (pino-pretty) are installed', () => {
    expect(usesPrettyTransport({ NODE_ENV: 'development' })).toBe(true)
    expect(usesPrettyTransport({ NODE_ENV: 'production' })).toBe(false)
    expect(usesPrettyTransport({ NODE_ENV: 'test' })).toBe(false)
    // A plain `bun run worker` has no NODE_ENV and may have pruned devDependencies.
    expect(usesPrettyTransport({})).toBe(false)
  })
})

describe('createLogger output', () => {
  it('writes JSON lines with the message and the child module', () => {
    const { destination, entries } = capture()
    const log = createLogger({ env: { NODE_ENV: 'production' }, destination }).child({
      module: 'cache',
    })
    log.error({ uploadId: 'u1' }, 'read failed')
    expect(entries()).toEqual([
      expect.objectContaining({ level: 50, module: 'cache', uploadId: 'u1', msg: 'read failed' }),
    ])
  })

  it('redacts links, tokens, passwords and credentials headers', () => {
    const { destination, entries } = capture()
    const log = createLogger({ env: { NODE_ENV: 'production' }, destination })
    log.info(
      {
        url: 'https://app.test/reset?token=secret',
        token: 'secret',
        password: 'hunter2',
        props: { url: 'https://app.test/verify?token=secret', name: 'Ada' },
        user: { token: 'secret', password: 'hunter2' },
        headers: { cookie: 'session=secret', authorization: 'Bearer secret', accept: '*/*' },
      },
      'event',
    )
    const [entry] = entries()
    expect(entry.url).toBe('[redacted]')
    expect(entry.token).toBe('[redacted]')
    expect(entry.password).toBe('[redacted]')
    expect(entry.props).toEqual({ url: '[redacted]', name: 'Ada' })
    expect(entry.user).toEqual({ token: '[redacted]', password: '[redacted]' })
    expect(entry.headers).toEqual({
      cookie: '[redacted]',
      authorization: '[redacted]',
      accept: '*/*',
    })
    expect(JSON.stringify(entry)).not.toContain('secret')
  })
})
