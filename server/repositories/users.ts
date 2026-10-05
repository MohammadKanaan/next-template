import 'server-only'
import { db } from '@/server/db'

export function findUser(id: number) {
  return db.orm.public.User.where({ id }).first()
}

export function findUserByEmail(email: string) {
  return db.orm.public.User.where({ email: email.toLowerCase() }).first()
}
