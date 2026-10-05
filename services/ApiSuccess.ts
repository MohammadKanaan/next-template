import type { ApiResponse } from '@/types/api'

export class ApiSuccess<T> {
  static defaultMessage = 'Operation completed successfully'

  constructor(
    private message: string = ApiSuccess.defaultMessage,
    private status = 200,
  ) {}

  createResponse(data: T | null): ApiResponse<T> {
    return { success: true, status: this.status, message: this.message, data }
  }
}
