// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmEmailChange } from '@/emails/ConfirmEmailChange'
import { ResetPassword } from '@/emails/ResetPassword'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { handleSendEmail } from '@/jobs/sendEmail'
import { sendMail } from '@/lib/server/mailer'

vi.mock('@/lib/server/mailer', () => ({ sendMail: vi.fn(async () => {}) }))

const props = { name: 'Ada', url: 'http://localhost:3000/api/auth/verify-email?token=t' }

describe('send-email job', () => {
  afterEach(() => vi.mocked(sendMail).mockClear())

  it('sends the verification template', async () => {
    await handleSendEmail({ template: 'verify-email', to: 'ada@example.com', props })
    expect(sendMail).toHaveBeenCalledTimes(1)
    const [mail] = vi.mocked(sendMail).mock.calls[0]
    expect(mail).toMatchObject({ to: 'ada@example.com', subject: 'Verify your email' })
    expect(mail.react.type).toBe(VerifyEmail)
    expect(mail.react.props).toEqual(props)
  })

  it('sends the reset-password template', async () => {
    await handleSendEmail({ template: 'reset-password', to: 'ada@example.com', props })
    const [mail] = vi.mocked(sendMail).mock.calls[0]
    expect(mail).toMatchObject({ to: 'ada@example.com', subject: 'Reset your password' })
    expect(mail.react.type).toBe(ResetPassword)
  })

  it('sends the email-change confirmation to the given (current) address', async () => {
    const changeProps = { ...props, newEmail: 'new@example.com' }
    await handleSendEmail({
      template: 'confirm-email-change',
      to: 'old@example.com',
      props: changeProps,
    })
    const [mail] = vi.mocked(sendMail).mock.calls[0]
    expect(mail).toMatchObject({ to: 'old@example.com', subject: 'Confirm your email change' })
    expect(mail.react.type).toBe(ConfirmEmailChange)
    expect(mail.react.props).toEqual(changeProps)
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
