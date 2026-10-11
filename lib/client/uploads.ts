import type { UploadTicket } from '@/lib/dto/uploads'
import { RequestError } from './errors'

/**
 * Sends `file` straight to storage with the presigned PUT `ticket` (the one client request that
 * goes to a non-app URL). The ticket's headers are part of its signature, so they go as they are;
 * the browser adds the `Content-Length` the signature also covers.
 */
export const uploadFile = async (ticket: UploadTicket, file: File, signal?: AbortSignal) => {
  const response = await fetch(ticket.url, {
    method: 'PUT',
    headers: ticket.headers,
    body: file,
    signal,
  })
  if (!response.ok) {
    // Storage answers with XML; its detail is not for users. 4xx means the signature refused the file.
    throw new RequestError(
      response.status < 500 ? 'The upload was rejected' : 'The upload failed. Try again.',
      response.status,
    )
  }
}
