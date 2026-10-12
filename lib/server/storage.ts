import 'server-only'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { MINUTE } from '@/lib/constants-time'
import { serverEnv, type ServerEnv } from './env'

// Cloudflare R2 through its S3 API. The five `R2_*` variables are optional as a group: without
// them `isStorageConfigured()` is false, the DAL refuses to issue tickets and the UI hides the
// upload controls, so the template runs without an R2 account.

type StorageEnv = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicUrl: string
}

const storageEnv = (): StorageEnv | null => {
  const env: ServerEnv = serverEnv()
  if (!env.R2_ACCOUNT_ID) {
    return null
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    // `serverEnv()` guarantees the group is complete when `R2_ACCOUNT_ID` is set.
    accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    bucket: env.R2_BUCKET ?? '',
    publicUrl: env.R2_PUBLIC_URL ?? '',
  }
}

/** Whether uploads can work at all (the `R2_*` variables are set). Public: it only gates UI. */
export const isStorageConfigured = (): boolean => storageEnv() !== null

const requireStorageEnv = (): StorageEnv => {
  const env = storageEnv()
  if (!env) {
    throw new Error('Storage is not configured: set the R2_* variables')
  }
  return env
}

const globalForStorage = globalThis as unknown as { r2?: S3Client }

/** Shared client, created on first use so importing this file never needs the R2 variables. */
const getClient = (): S3Client => {
  if (!globalForStorage.r2) {
    const env = requireStorageEnv()
    globalForStorage.r2 = new S3Client({
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      // R2 ignores the region, but the SDK requires one; `auto` is what Cloudflare documents.
      region: 'auto',
      // Path-style URLs (`<endpoint>/<bucket>/<key>`): one host to allow in CORS and CSP, and a
      // bucket name with dots still gets a valid certificate.
      forcePathStyle: true,
      credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    })
  }
  return globalForStorage.r2
}

export type PresignedPut = { url: string; headers: Record<string, string> }

type PresignOptions = {
  key: string
  contentType: string
  /** The exact size of the object the browser will upload, in bytes. */
  size: number
  /** Seconds the ticket stays valid. */
  expiresIn?: number
}

/**
 * A presigned PUT the browser can send a file to directly. R2 has no presigned POST (whose policy
 * could cap a size range), so the signature covers the `Content-Type` and the exact
 * `Content-Length` instead: a file of another type or size is refused by storage. The browser
 * sets `Content-Length` itself from the body; the caller sends the returned headers as they are.
 * `attach` re-checks the stored object anyway (`headObject`).
 */
export const createUploadTicket = async ({
  key,
  contentType,
  size,
  expiresIn = 5 * MINUTE,
}: PresignOptions): Promise<PresignedPut> => {
  const url = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: requireStorageEnv().bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
  )
  return { url, headers: { 'Content-Type': contentType } }
}

export type ObjectHead = { size: number; contentType: string | null }

/** What is actually stored under `key`, or null when nothing was uploaded. */
export const headObject = async (key: string): Promise<ObjectHead | null> => {
  try {
    const head = await getClient().send(
      new HeadObjectCommand({ Bucket: requireStorageEnv().bucket, Key: key }),
    )
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null }
  } catch (error) {
    if (
      error instanceof NotFound ||
      (error as S3ServiceException).$metadata?.httpStatusCode === 404
    ) {
      return null
    }
    throw error
  }
}

/** Removes the object; a missing key counts as success. */
export const deleteObject = async (key: string): Promise<void> => {
  await getClient().send(new DeleteObjectCommand({ Bucket: requireStorageEnv().bucket, Key: key }))
}

/** The URL anyone can load the object from: the bucket's public domain plus the key. */
export const publicUrl = (key: string): string => {
  return `${requireStorageEnv().publicUrl.replace(/\/+$/, '')}/${key}`
}
