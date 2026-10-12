import { MINUTE } from './constants-time'

/**
 * Requests one client address may make to one public `/api/v1` endpoint per minute. Generous: the
 * NavBar's typeahead asks on every pause in typing and the movie list's infinite scroll on every
 * batch, and an office or a school shares one address. Read by the limiter and by the OpenAPI
 * document, which must not import the DAL.
 */
export const PUBLIC_API_LIMIT = { max: 120, windowMs: MINUTE * 1000 }
