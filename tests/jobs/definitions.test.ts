import { describe, expect, it } from 'vitest'
import { jobs, sendEmailPayload } from '@/jobs/definitions'

const verifyEmail = {
  template: 'verify-email',
  to: 'ada@example.com',
  props: { name: 'Ada', url: 'http://localhost:3000/api/auth/verify-email?token=t' },
} as const

describe('job definitions', () => {
  it('accepts a payload for each email template', () => {
    expect(sendEmailPayload.parse(verifyEmail)).toEqual(verifyEmail)
    const reset = { ...verifyEmail, template: 'reset-password' }
    expect(sendEmailPayload.parse(reset)).toEqual(reset)
  })

  it('accepts an email-change confirmation and requires the new address', () => {
    const confirm = {
      template: 'confirm-email-change',
      to: 'old@example.com',
      props: { name: 'Ada', newEmail: 'new@example.com', url: verifyEmail.props.url },
    }
    expect(sendEmailPayload.parse(confirm)).toEqual(confirm)
    expect(
      sendEmailPayload.safeParse({ ...confirm, props: { name: 'Ada', url: verifyEmail.props.url } })
        .success,
    ).toBe(false)
    expect(
      sendEmailPayload.safeParse({ ...confirm, props: { ...confirm.props, newEmail: 'nope' } })
        .success,
    ).toBe(false)
  })

  it('rejects an unknown template, a bad address, and a bad link', () => {
    expect(sendEmailPayload.safeParse({ ...verifyEmail, template: 'newsletter' }).success).toBe(
      false,
    )
    expect(sendEmailPayload.safeParse({ ...verifyEmail, to: 'not-an-email' }).success).toBe(false)
    expect(
      sendEmailPayload.safeParse({ ...verifyEmail, props: { name: 'Ada', url: 'nope' } }).success,
    ).toBe(false)
  })

  it('requires the template props', () => {
    expect(sendEmailPayload.safeParse({ ...verifyEmail, props: {} }).success).toBe(false)
  })

  it('keeps completed send-email jobs for an hour, not the pg-boss default of a week', () => {
    // The payloads carry live reset and verification links.
    expect(jobs['send-email'].options.deleteAfterSeconds).toBe(3600)
  })

  it('runs the cleanup every hour', () => {
    expect(jobs.cleanup.cron).toBe('0 * * * *')
    expect(jobs.cleanup.schema.safeParse({}).success).toBe(true)
  })
})
