// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { resetServerEnv } from '@/lib/server/env'
import { sendMail } from '@/lib/server/mailer'
import { createElement } from 'react'

const send = vi.hoisted(() => vi.fn())
const log = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/server/logger', () => ({ logger: { child: () => log } }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const url = 'http://localhost:3000/api/auth/verify-email?token=abc'
const mail = {
  to: 'ada@example.com',
  subject: 'Verify your email',
  react: createElement(VerifyEmail, { name: 'Ada', url }),
}

describe('sendMail', () => {
  beforeEach(() => {
    send.mockReset()
    log.info.mockReset()
    resetServerEnv()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    resetServerEnv()
  })

  it('logs the recipient, subject and link when no Resend key is set', async () => {
    vi.stubEnv('RESEND_API_KEY', undefined)
    await sendMail(mail)
    expect(send).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      { to: 'ada@example.com', subject: 'Verify your email' },
      expect.stringContaining(url),
    )
  })

  it('throws in production without a Resend key and never logs the message', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(sendMail(mail)).rejects.toThrow('RESEND_API_KEY')
    expect(send).not.toHaveBeenCalled()
    expect(log.info).not.toHaveBeenCalled()
  })

  it('sends rendered html and text through Resend when a key is set', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null })
    await sendMail(mail)
    expect(send).toHaveBeenCalledWith({
      from: process.env.EMAIL_FROM,
      to: 'ada@example.com',
      subject: 'Verify your email',
      html: expect.stringContaining('Verify email'),
      text: expect.stringContaining(url),
    })
  })

  it('throws when Resend rejects the message so the job is retried', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key')
    send.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Slow down' },
    })
    await expect(sendMail(mail)).rejects.toThrow('rate_limit_exceeded')
  })
})
