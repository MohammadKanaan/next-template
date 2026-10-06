import type { UploadTicket } from '@/lib/dto/uploads'
import { RequestError } from './posts'

/**
 * Sends `file` straight to storage with the presigned POST `ticket` (the one client request that
 * goes to a non-app URL). The policy fields must come first and the file last, as S3 requires.
 */
export const uploadFile = async (ticket: UploadTicket, file: File, signal?: AbortSignal) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(ticket.fields)) {
    body.append(name, value)
  }
  body.append('file', file)
  const response = await fetch(ticket.url, { method: 'POST', body, signal })
  if (!response.ok) {
    // Storage answers with XML; its detail is not for users. 4xx means the policy refused the file.
    throw new RequestError(
      response.status < 500 ? 'The upload was rejected' : 'The upload failed. Try again.',
      response.status,
    )
  }
}
