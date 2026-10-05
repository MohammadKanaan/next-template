import 'server-only'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
  type S3ServiceException,
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { serverEnv } from './env'

const globalForStorage = globalThis as unknown as { s3?: S3Client; s3Public?: S3Client }

function createClient(endpoint: string): S3Client {
  const env = serverEnv()
  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    // MinIO and most self-hosted S3 servers address buckets by path, not by subdomain.
    forcePathStyle: true,
  })
}

/** Shared client, created on first use so importing this file never needs the S3 variables. */
function getClient(): S3Client {
  globalForStorage.s3 ??= createClient(serverEnv().S3_ENDPOINT)
  return globalForStorage.s3
}

/**
 * Client whose endpoint is the one the browser reaches (`S3_PUBLIC_ENDPOINT`); only used to build
 * presigned POST URLs, which are signed for that host. Falls back to the server's own client.
 */
function getSigningClient(): S3Client {
  const publicEndpoint = serverEnv().S3_PUBLIC_ENDPOINT
  if (!publicEndpoint) {
    return getClient()
  }
  globalForStorage.s3Public ??= createClient(publicEndpoint)
  return globalForStorage.s3Public
}

export type PresignedPost = { url: string; fields: Record<string, string> }

type PresignOptions = {
  key: string
  contentType: string
  /** The largest object the browser may upload, in bytes. */
  maxSize: number
  /** Seconds the ticket stays valid. */
  expiresIn?: number
}

/**
 * A presigned POST the browser can send a file to directly. Unlike a presigned PUT, its policy can
 * cap the object size (`content-length-range`) and pin the `Content-Type`, so S3 itself rejects an
 * oversized or wrongly typed upload.
 */
export async function createUploadTicket({
  key,
  contentType,
  maxSize,
  expiresIn = 300,
}: PresignOptions): Promise<PresignedPost> {
  return createPresignedPost(getSigningClient(), {
    Bucket: serverEnv().S3_BUCKET,
    Key: key,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', 1, maxSize],
      ['eq', '$Content-Type', contentType],
    ],
    Expires: expiresIn,
  })
}

export type ObjectHead = { size: number; contentType: string | null }

/** What is actually stored under `key`, or null when nothing was uploaded. */
export async function headObject(key: string): Promise<ObjectHead | null> {
  try {
    const head = await getClient().send(
      new HeadObjectCommand({ Bucket: serverEnv().S3_BUCKET, Key: key }),
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

/** Removes the object; S3 treats a missing key as success. */
export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: serverEnv().S3_BUCKET, Key: key }))
}

/** The URL anyone can load the object from (`S3_PUBLIC_URL` already includes the bucket). */
export function publicUrl(key: string): string {
  return `${serverEnv().S3_PUBLIC_URL.replace(/\/+$/, '')}/${key}`
}
