/** A failed client request: a user-facing message and the HTTP status. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}
