import 'server-only'

/** The realtime channel of one user: their notifications and unread count. */
export const userChannel = (id: string) => `realtime:user:${id}`
