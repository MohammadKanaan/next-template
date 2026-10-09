import { deleteObject } from '@/lib/server/storage'
import { jobs } from './definitions'

/** Removes one object from storage, e.g. an avatar that was replaced. */
export const handleDeleteObject = async (payload: unknown) => {
  const { key } = jobs['delete-object'].schema.parse(payload)
  await deleteObject(key)
}
