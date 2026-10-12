# Uploads (Cloudflare R2)

What the code cannot tell you: how to create the R2 bucket and the credentials the profile photo
upload needs. The flow itself (a presigned PUT issued by `createUpload`, sent by the browser with
`uploadFile`, attached by `attachAvatar`) is in `lib/data/uploads.ts`, `lib/server/storage.ts` and
`lib/client/uploads.ts`, with the rules in `UPLOAD_RULES` (`lib/dto/uploads.ts`). Storage is R2
through its S3 API, so the client is `@aws-sdk/client-s3`.

Uploads are optional. The five `R2_*` variables are **all or none** (`lib/server/env.ts` refuses a
partial set). Without them the DAL refuses tickets and `/settings` hides the profile photo section.
With them:

| Variable               | Value                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Your Cloudflare account id; the S3 endpoint is `https://<account>.r2.cloudflarestorage.com`.        |
| `R2_ACCESS_KEY_ID`     | From an R2 API token with **Object Read & Write** on the bucket (R2 → Manage R2 API Tokens).        |
| `R2_SECRET_ACCESS_KEY` | Its secret.                                                                                         |
| `R2_BUCKET`            | The bucket name.                                                                                    |
| `R2_PUBLIC_URL`        | The bucket's public origin, no path: its `https://pub-….r2.dev` subdomain or a custom domain on it. |

## Setting up the bucket in the Cloudflare dashboard

1. **Create the bucket.** Location hint as you like; `region` in the client is `auto`.
2. **Public access.** Settings → Public access: enable the `r2.dev` subdomain (fine for a template;
   rate limited and not for production traffic) or connect a custom domain (recommended in
   production: Cloudflare's cache and WAF sit in front). Either origin is `R2_PUBLIC_URL`. This makes
   **every object in the bucket** readable by URL: private documents need short-lived signed GET URLs
   from the DAL instead of `publicUrl`, and a separate bucket.
3. **CORS.** Settings → CORS policy. The browser's presigned PUT is a cross-origin request with a
   `Content-Type` header, so it preflights; allow your app origins:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-app.example"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Reads through `R2_PUBLIC_URL` are plain `<img>` loads and need no CORS.
4. **API token.** Manage R2 API Tokens → Create: Object Read & Write, scoped to this bucket. The
   token's Access Key ID and Secret Access Key are the two credential variables.

## Good to know

- R2 has no presigned POST, so the PUT's signature covers the `Content-Type` and the exact
  `Content-Length`: a file of another type or size is refused by R2 with a 403.
- The client uses path-style URLs (`forcePathStyle: true`), so one host
  (`<account>.r2.cloudflarestorage.com`) covers CORS and the CSP `connect-src`, and a bucket name with
  dots still gets a valid certificate.
- **No SVG or HTML, ever:** the bucket serves files from a public origin, and those execute in the
  browser. `UPLOAD_RULES` is the one definition of what each purpose accepts.
- Compose passes the five variables from `.env` to `web` and `worker` (empty by default). Tests mock
  `@/lib/server/storage` and never need an account.
