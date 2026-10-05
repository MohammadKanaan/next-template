import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { ActionFailure } from '@/types/api'

/** Puts a failed action's field errors on the matching fields, or its message on `root.server`. */
export function applyActionErrors<T extends FieldValues>(
  failure: ActionFailure,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
) {
  let matched = false
  for (const field of fields) {
    const message = failure.fieldErrors?.[field]?.[0]
    if (message) {
      setError(field, { type: 'server', message })
      matched = true
    }
  }
  if (!matched) {
    setError('root.server', { type: 'server', message: failure.message })
  }
}
