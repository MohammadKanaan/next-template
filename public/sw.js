// Web Push service worker. Registered by components/Settings/PushSettings; messages come from
// jobs/sendPush.ts with the payload { title, body, url }.

// Every push must end in a visible notification: the subscription is `userVisibleOnly`, and
// Chrome and Safari both require it (Safari may revoke a subscription that skips one). A focused
// tab therefore gets its toast and the system notification.
const readPayload = (event) => {
  try {
    const payload = event.data?.json()
    if (payload && typeof payload.title === 'string') {
      return payload
    }
  } catch {
    // Not JSON: fall through to the generic notification.
  }
  return { title: 'New notification' }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const { title, body, url } = readPayload(event)
      await self.registration.showNotification(title, {
        ...(typeof body === 'string' ? { body } : {}),
        data: typeof url === 'string' ? { url } : {},
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Never navigate an arbitrary tab (it may hold unsaved input): reuse one already there.
      const existing = windows.find((client) => client.url === url)
      if (existing) {
        await existing.focus()
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
