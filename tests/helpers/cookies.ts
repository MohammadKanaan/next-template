/** In-memory stand-in for the browser's cookies across mocked `cookies()` / `headers()` calls. */
export const cookieJar = new Map<string, string>()

export const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  has: (name: string) => cookieJar.has(name),
  set: (name: string, value: string) => {
    cookieJar.set(name, value)
  },
  delete: (name: string) => {
    cookieJar.delete(name)
  },
}

/** Request headers as a browser would send them back, encoded the way Next serialises cookies. */
export const requestHeaders = () => {
  const cookie = [...cookieJar]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ')
  return new Headers(cookie ? { cookie } : {})
}
