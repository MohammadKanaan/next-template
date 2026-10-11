import { describe, expect, it } from 'vitest'
import { confirmEmailChangeEmail } from '@/emails/confirmEmailChange'
import { buildEmail, escapeHtml } from '@/emails/layout'
import { resetPasswordEmail } from '@/emails/resetPassword'
import { verifyEmail } from '@/emails/verifyEmail'

const url = 'http://localhost:3000/api/auth/reset-password/tok?callbackURL=%2Freset-password'

describe('email templates', () => {
  it.each([
    ['verifyEmail', verifyEmail({ name: 'Ada', url }), 'Verify your email', 'Verify email'],
    [
      'resetPasswordEmail',
      resetPasswordEmail({ name: 'Ada', url }),
      'Reset your password',
      'Reset password',
    ],
    [
      'confirmEmailChangeEmail',
      confirmEmailChangeEmail({ name: 'Ada', newEmail: 'new@example.com', url }),
      'Confirm your email change',
      'Confirm email change',
    ],
  ])(
    '%s has the subject, the greeting and the link in both html and text',
    (_name, mail, subject, label) => {
      expect(mail.subject).toBe(subject)
      expect(mail.html).toContain(`<h1 style="margin:0 0 16px;font-size:20px;">${subject}</h1>`)
      expect(mail.html).toContain('Hi Ada,')
      expect(mail.html).toContain(`href="${escapeHtml(url)}"`)
      expect(mail.html).toContain(`>${label}</a>`)
      expect(mail.text).toContain('Hi Ada,')
      // The link sits on its own line of the plain text, so a log reader (and the tests) can copy it.
      expect(mail.text).toContain(`${label}: ${url}`)
    },
  )

  it('mentions the new address in the confirmation of an email change', () => {
    const mail = confirmEmailChangeEmail({ name: 'Ada', newEmail: 'new@example.com', url })
    expect(mail.text).toContain('new@example.com')
    expect(mail.html).toContain('new@example.com')
  })

  it('escapes every interpolated value in the html, and leaves the text alone', () => {
    const mail = verifyEmail({ name: '<b>Ada</b> & "co"', url: 'http://x.test/?a=1&b=<2>' })
    expect(mail.html).not.toContain('<b>Ada</b>')
    expect(mail.html).toContain('&lt;b&gt;Ada&lt;/b&gt; &amp; &quot;co&quot;')
    expect(mail.html).toContain('href="http://x.test/?a=1&amp;b=&lt;2&gt;"')
    expect(mail.text).toContain('<b>Ada</b> & "co"')
  })

  it('builds any content into the shared layout', () => {
    const mail = buildEmail({
      subject: 'S',
      greeting: 'G',
      paragraphs: ['P1', 'P2'],
      action: { label: 'Go', url: 'http://x.test/' },
      footnote: 'F',
    })
    expect(mail.html).toMatch(/^<!DOCTYPE html>/)
    expect(mail.text.split('\n')).toEqual([
      'S',
      '',
      'G',
      '',
      'P1',
      'P2',
      '',
      'Go: http://x.test/',
      '',
      'F',
    ])
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters that matter in markup', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })
})
