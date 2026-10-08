import { NextResponse } from 'next/server'
import { parseInput, toErrorResponse } from '@/lib/data/errors'
import { listNotifications } from '@/lib/data/notifications'
import { listNotificationsQuery } from '@/lib/dto/notifications'

/** The bell's popover and the page's "Load more" read notifications here, a cursor page at a time. */
export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url)
    // Decodes the query string (every value arrives as a string); the DAL validates again.
    const query = parseInput(listNotificationsQuery, Object.fromEntries(searchParams))
    return NextResponse.json(await listNotifications(query))
  } catch (error) {
    return toErrorResponse(error)
  }
}
