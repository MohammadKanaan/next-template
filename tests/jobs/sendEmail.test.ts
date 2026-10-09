// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSendEmail, renderEmail } from '@/jobs/sendEmail'
import { sendMail } from '@/lib/server/mailer'

vi.mock('@/lib/server/mailer', () => ({ sendMail: vi.fn(async () => {}) }))

const props = { name: 'Ada', url: 'http://localhost:3000/api/auth/verify-email?token=t' }

describe('send-email job', () => {
  afterEach(() => vi.mocked(sendMail).mockClear())

  it('renders each template with its subject and the link', () => {
    expect(renderEmail({ template: 'verify-email', to: 'ada@example.com', props })).toMatchObject({
      to: 'ada@example.com',
      subject: 'Verify your email',
      text: expect.stringContaining(props.url),
    })
    expect(renderEmail({ template: 'reset-password', to: 'ada@example.com', props })).toMatchObject(
      { to: 'ada@example.com', subject: 'Reset your password' },
    )
    const changed = renderEmail({
      template: 'confirm-email-change',
      to: 'old@example.com',
      props: { ...props, newEmail: 'new@example.com' },
    })
    expect(changed).toMatchObject({ to: 'old@example.com', subject: 'Confirm your email change' })
    expect(changed.text).toContain('new@example.com')
  })

  it('sends the rendered mail', async () => {
    await handleSendEmail({ template: 'verify-email', to: 'ada@example.com', props })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendMail).mock.calls[0][0]).toMatchObject({
      to: 'ada@example.com',
      subject: 'Verify your email',
      html: expect.stringContaining('Verify email'),
    })
  })

  it('re-validates the payload and sends nothing when it is invalid', async () => {
    await expect(
      handleSendEmail({ template: 'newsletter', to: 'ada@example.com', props }),
    ).rejects.toThrow()
    await expect(
      handleSendEmail({ template: 'verify-email', to: 'not-an-email', props }),
    ).rejects.toThrow()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('lets a mailer failure propagate so pg-boss retries the job', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('resend down'))
    await expect(
      handleSendEmail({ template: 'verify-email', to: 'ada@example.com', props }),
    ).rejects.toThrow('resend down')
  })
})
