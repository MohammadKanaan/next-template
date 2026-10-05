export type ValidationErrors = Record<string, string[]>

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  status: number
  message: string
  errors?: ValidationErrors
}

export interface Listing<T, E = Record<string, unknown>> {
  list: T[]
  extra_data: E
  limit_value: number
  total_pages: number
  total_count: number
  current_page: number
  next_page: number | null
  prev_page: number | null
}

export interface Permissions {
  update: boolean
  destroy: boolean
}

export interface ApiErrorBody {
  message: string
  errors?: ValidationErrors
}
