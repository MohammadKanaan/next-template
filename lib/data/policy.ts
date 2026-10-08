import 'server-only'
import type { SessionUser } from './auth'
import { ForbiddenError } from './errors'

/**
 * A record-level rule: may this viewer (`null` when signed out) do something with this record?
 * Pure: no database, no session read. The DAL loads the record and calls the rule.
 */
export type Rule<R> = (viewer: SessionUser | null, record: R) => boolean

/** The rules of one resource, by action name (see `lib/data/policies/<resource>.ts`). */
export type Policy<R> = Record<string, Rule<R>>

/** Throws `ForbiddenError` (403) when the rule does not allow the viewer. */
export const authorize = <R>(
  rule: Rule<R>,
  viewer: SessionUser | null,
  record: R,
  message?: string,
): void => {
  if (!rule(viewer, record)) {
    throw new ForbiddenError(message)
  }
}

/** The booleans of a DTO's `permissions` field: one per listed action, evaluated for this viewer. */
export const permissionsFor = <R, P extends Policy<R>, A extends keyof P & string>(
  policy: P,
  actions: readonly A[],
  viewer: SessionUser | null,
  record: R,
): Record<A, boolean> => {
  const permissions = {} as Record<A, boolean>
  for (const action of actions) {
    permissions[action] = policy[action](viewer, record)
  }
  return permissions
}
