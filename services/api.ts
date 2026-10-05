import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { env } from '@/lib/env'
import type { ApiResponse, ValidationErrors } from '@/types/api'
import { ApiError } from './ApiError'
import { ApiSuccess } from './ApiSuccess'

export type { ApiResponse, Listing } from '@/types/api'

export interface ApiConfig {
  baseURL?: string
  headers?: Record<string, string>
  resourcePath?: string
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

type ApiErrorResponseData = {
  message?: unknown
  errors?: Record<string, unknown>
  data?: { message?: unknown; errors?: Record<string, unknown> }
}

export function normalizeValidationErrors(
  errors?: Record<string, unknown>,
): ValidationErrors | undefined {
  if (!errors || Object.keys(errors).length === 0) {
    return undefined
  }
  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [
      field,
      (Array.isArray(messages) ? messages : [messages]).map(String),
    ]),
  )
}

export function formatValidationErrors(errors?: ValidationErrors) {
  if (!errors) {
    return undefined
  }
  return Object.entries(errors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join('; ')
}

async function readErrorBody(raw: unknown): Promise<ApiErrorResponseData | undefined> {
  if (typeof Blob !== 'undefined' && raw instanceof Blob) {
    try {
      return JSON.parse(await raw.text())
    } catch {
      return undefined
    }
  }
  return raw && typeof raw === 'object' ? (raw as ApiErrorResponseData) : undefined
}

// This API client is intentionally a static singleton (Revcube structure).
class API {
  protected static axiosInstance: AxiosInstance
  protected static resourcePath = ''

  public static initialize(config: ApiConfig): void {
    this.axiosInstance = axios.create({ baseURL: config.baseURL, headers: config.headers })
    this.resourcePath = config.resourcePath ?? ''
  }

  public static setDefaultResourcePath(path: string): void {
    this.resourcePath = path
  }

  public static setHeaders(headers: Record<string, string>): void {
    Object.assign(this.axiosInstance.defaults.headers.common, headers)
  }

  public static addRequestInterceptor(
    onFulfilled?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig,
    onRejected?: (error: unknown) => unknown,
  ): number {
    return this.axiosInstance.interceptors.request.use(onFulfilled, onRejected)
  }

  public static removeRequestInterceptor(id: number): void {
    this.axiosInstance.interceptors.request.eject(id)
  }

  public static addResponseInterceptor(
    onFulfilled?: (response: AxiosResponse) => AxiosResponse,
    onRejected?: (error: unknown) => unknown,
  ): number {
    return this.axiosInstance.interceptors.response.use(onFulfilled, onRejected)
  }

  public static removeResponseInterceptor(id: number): void {
    this.axiosInstance.interceptors.response.eject(id)
  }

  protected static concatUrl(url: string): string {
    return this.resourcePath ? `${this.resourcePath}/${url}` : url
  }

  protected static async makeRequest<T>(
    method: HttpMethod,
    url: string,
    data?: unknown,
    params?: object,
    signal?: AbortSignal,
    responseType?: 'json' | 'blob',
    successMessage = 'Request successful',
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.request<T>({
        method,
        url: this.concatUrl(url),
        data,
        params,
        signal,
        responseType,
      })
      return new ApiSuccess<T>(successMessage, response.status).createResponse(
        response.data ?? null,
      )
    } catch (error) {
      if (axios.isCancel(error)) {
        return new ApiError(499, 'Request canceled').toResponse()
      }
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 500
        const body = await readErrorBody(error.response?.data)
        const errors = normalizeValidationErrors(body?.errors ?? body?.data?.errors)
        const serverMessage = body?.message ?? body?.data?.message
        const message =
          formatValidationErrors(errors) ||
          (typeof serverMessage === 'string' && serverMessage) ||
          error.message ||
          'An unknown error occurred'
        return new ApiError(status, message, errors).toResponse()
      }
      return new ApiError(500, 'An unknown error occurred').toResponse()
    }
  }

  public static get<T>(url: string, params?: object, signal?: AbortSignal) {
    return this.makeRequest<T>('get', url, undefined, params, signal)
  }

  public static post<T>(url: string, data?: object, params?: object) {
    return this.makeRequest<T>('post', url, data, params)
  }

  public static put<T>(url: string, data?: object, params?: object) {
    return this.makeRequest<T>('put', url, data, params)
  }

  public static patch<T>(url: string, data?: object, params?: object) {
    return this.makeRequest<T>('patch', url, data, params)
  }

  public static delete<T = null>(url: string, params?: object) {
    return this.makeRequest<T>('delete', url, undefined, params)
  }

  public static downloadFile(url: string, params?: object) {
    return this.makeRequest<Blob>(
      'get',
      url,
      undefined,
      params,
      undefined,
      'blob',
      'File downloaded successfully',
    )
  }

  public static uploadFile<T = unknown>(url: string, file: File, params?: object) {
    const formData = new FormData()
    formData.append('file', file)
    return this.makeRequest<T>(
      'post',
      url,
      formData,
      params,
      undefined,
      undefined,
      'File uploaded successfully',
    )
  }
}

API.initialize({ baseURL: env.apiBaseUrl })

export default API
