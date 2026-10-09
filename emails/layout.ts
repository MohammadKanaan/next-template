/** A rendered email: the subject line, the HTML body and its plain-text twin. */
export type EmailMessage = {
  subject: string
  html: string
  text: string
}

/** Escapes text for an HTML body or attribute. Every interpolated value goes through it. */
export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

type EmailContent = {
  subject: string
  /** The first line of the email ("Hi Ada,"). */
  greeting: string
  /** Plain-text paragraphs; escaped for the HTML version. */
  paragraphs: string[]
  /** The one action of the email. */
  action: { label: string; url: string }
  /** Shown under the button, in a smaller type. */
  footnote: string
}

/**
 * Builds a message from its content, so every email shares one layout. The templates are plain
 * functions (no React, no rendering step), so they can be built inside a request without a worker.
 * Email clients need inline styles; the no-inline-style rule is for the web UI.
 */
export const buildEmail = ({
  subject,
  greeting,
  paragraphs,
  action,
  footnote,
}: EmailContent): EmailMessage => {
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(subject)}</h1>
          <p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(greeting)}</p>
          ${paragraphs.map((paragraph) => `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(paragraph)}</p>`).join('\n          ')}
          <p style="margin:24px 0;">
            <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(action.label)}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;line-height:1.5;">${escapeHtml(footnote)}</p>
          <p style="margin:0;font-size:13px;color:#71717a;word-break:break-all;">${escapeHtml(action.url)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>
`
  const text = [
    subject,
    '',
    greeting,
    '',
    ...paragraphs,
    '',
    `${action.label}: ${action.url}`,
    '',
    footnote,
  ].join('\n')
  return { subject, html, text }
}
