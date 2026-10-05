import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/data/auth'

export const { GET, POST } = toNextJsHandler(auth)
