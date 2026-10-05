// @vitest-environment node
import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import { ResetPassword } from '@/emails/ResetPassword'
import { VerifyEmail } from '@/emails/VerifyEmail'

const url = 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2F'

describe('email templates', () => {
  it('renders the verification link as a button and as text', async () => {
    const element = <VerifyEmail name="Ada" url={url} />
    const html = await render(element)
    expect(html).toContain('Hi Ada')
    expect(html).toContain('href="http://localhost:3000/api/auth/verify-email?token=abc&amp;')
    expect(await render(element, { plainText: true })).toContain(url)
  })

  it('renders the reset link and says it expires', async () => {
    const element = <ResetPassword name="Ada" url={url} />
    const text = await render(element, { plainText: true })
    expect(text).toContain(url)
    expect(text).toContain('expires in one hour')
  })
})
