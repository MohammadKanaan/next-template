import 'server-only'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import type { ApiErrorBody, Listing, ValidationErrors } from '@/types/api'

export const DEFAULT_PER_PAGE = 10
export const MAX_PER_PAGE = 100

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(status: number, message: string, errors?: ValidationErrors) {
  const body: ApiErrorBody = errors ? { message, errors } : { message }
  return NextResponse.json(body, { status })
}

export function validationErrors(error: z.ZodError): ValidationErrors {
  const errors: ValidationErrors = {}
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'base'
    ;(errors[field] ??= []).push(issue.message)
  }
  return errors
}

export function invalid(error: z.ZodError) {
  return fail(422, 'Validation failed', validationErrors(error))
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = positiveInt(searchParams.get('page'), 1)
  const perPage = Math.min(positiveInt(searchParams.get('perPage'), DEFAULT_PER_PAGE), MAX_PER_PAGE)
  return { page, perPage, skip: (page - 1) * perPage }
}

export function parseId(value: string): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function toListing<T>(list: T[], totalCount: number, page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage))
  const listing: Listing<T> = {
    list,
    extraData: {},
    limitValue: perPage,
    totalPages,
    totalCount,
    currentPage: page,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  }
  return listing
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
