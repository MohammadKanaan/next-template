import type { ApiResponse, ValidationErrors } from '@/types/api'

export class ApiError extends Error {
  status: number
  errors?: ValidationErrors

  constructor(status: number, message: string, errors?: ValidationErrors) {
    super(message)
    this.status = status
    this.errors = errors
    this.name = 'ApiError'
  }

  toResponse<T = never>(): ApiResponse<T> {
    return {
      success: false,
      status: this.status,
      message: this.message,
      data: null,
      ...(this.errors && { errors: this.errors }),
    }
  }
}
