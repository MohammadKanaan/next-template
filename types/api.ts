export type ValidationErrors = Record<string, string[]>

export type ApiResponse<T> = {
  success: boolean
  data: T | null
  status: number
  message: string
  errors?: ValidationErrors
}

export type Listing<T, E = Record<string, unknown>> = {
  list: T[]
  extraData: E
  limitValue: number
  totalPages: number
  totalCount: number
  currentPage: number
  nextPage: number | null
  prevPage: number | null
}

export type Permissions = {
  update: boolean
  destroy: boolean
}

export type ApiErrorBody = {
  message: string
  errors?: ValidationErrors
}
