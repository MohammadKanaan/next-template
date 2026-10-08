// Web Push service worker. Registered by components/Settings/PushSettings; messages come from
// jobs/sendPush.ts with the payload { title, body, url }.

self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }
  const payload = event.data.json()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // A focused tab already showed it through the bell.
      if (windows.some((client) => client.focused)) {
        return
      }
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        data: { url: payload.url },
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
      const existing = windows.find((client) => 'navigate' in client)
      if (existing) {
        await existing.focus()
        await existing.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
