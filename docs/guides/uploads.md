# Uploads (Cloudflare R2)

How to create the R2 bucket and credentials for the profile photo upload. The flow itself is in
`lib/data/uploads.ts`, `lib/server/storage.ts` and `lib/client/uploads.ts`, and what each purpose
accepts is in `UPLOAD_RULES` (`lib/dto/uploads.ts`).

The five variables are **all or none** (`lib/server/env.ts` refuses a partial set):

| Variable               | Value                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Your Cloudflare account id (the S3 endpoint is `https://<account>.r2.cloudflarestorage.com`). |
| `R2_ACCESS_KEY_ID`     | From an R2 API token with **Object Read & Write** on the bucket.                              |
| `R2_SECRET_ACCESS_KEY` | Its secret.                                                                                   |
| `R2_BUCKET`            | The bucket name.                                                                              |
| `R2_PUBLIC_URL`        | The bucket's public origin, no path: its `https://pub-….r2.dev` subdomain or a custom domain. |

## Setting up the bucket

1. **Create the bucket.** Any location hint (the client uses region `auto`).
2. **Public access** (Settings → Public access): enable the `r2.dev` subdomain (rate limited, fine
   for development) or connect a custom domain (production: Cloudflare's cache and WAF sit in
   front). That origin is `R2_PUBLIC_URL`. It makes **every object** readable by URL, so private
   files need a separate bucket and short-lived signed GET URLs from the DAL.
3. **CORS** (Settings → CORS policy). The browser's presigned PUT is a preflighted cross-origin
   request, so allow your app origins:
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
4. **API token** (Manage R2 API Tokens → Create): Object Read & Write, scoped to this bucket. Its
   Access Key ID and Secret Access Key are the two credential variables.

## Good to know

- R2 has no presigned POST, so the PUT's signature covers the `Content-Type` and the exact
  `Content-Length`; a file of another type or size gets a 403 from R2.
- **Never allow SVG or HTML:** the bucket serves from a public origin, where those execute.
- Tests mock `@/lib/server/storage` and need no account.
