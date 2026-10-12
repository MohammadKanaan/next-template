/**
 * A fresh nonce for one response: 128 random bits, base64. `proxy.ts` makes one per page request.
 */
export const createNonce = () => btoa(crypto.randomUUID())

/**
 * The page's Content-Security-Policy, built per request around `nonce`. Next reads the nonce back
 * from the request's copy of this header and puts it on every script it renders, and the root
 * layout hands it to next-themes' inline script; with `'strict-dynamic'`, only those scripts and
 * what they load may run, so an injected `<script>` or `onerror=` does nothing.
 *
 * - Styles stay `'unsafe-inline'`: Base UI positions popovers with `style` attributes, which a
 *   nonce cannot cover, and a style cannot run code.
 * - Images may come from any HTTPS origin: avatars are bucket URLs or Google's, and an image cannot run code either.
 * - The browser uploads straight to R2 (a presigned PUT), so its S3 endpoint is a `connect-src`.
 * - Google sign-in leaves through a redirect, which `form-action` also governs.
 * - Development adds `'unsafe-eval'` (React rebuilds server error stacks with `eval`) and leaves
 *   `http://localhost` alone instead of upgrading it.
 */
export const contentSecurityPolicy = (nonce: string, { dev }: { dev: boolean }) => {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.r2.cloudflarestorage.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ]
  return directives.join('; ')
}
