// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { resetServerEnv } from '@/lib/server/env'
import { sendMail } from '@/lib/server/mailer'
import { createElement } from 'react'

const send = vi.hoisted(() => vi.fn())
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
    resetServerEnv()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    resetServerEnv()
  })

  it('logs the recipient, subject and link when no Resend key is set', async () => {
    vi.stubEnv('RESEND_API_KEY', undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await sendMail(mail)
    expect(send).not.toHaveBeenCalled()
    const logged = log.mock.calls.flat().join('\n')
    expect(logged).toContain('ada@example.com')
    expect(logged).toContain('Verify your email')
    expect(logged).toContain(url)
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
