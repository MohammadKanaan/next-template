/**
 * Drops this browser's push subscription and returns the endpoint it had, so the caller can tell
 * the server to forget it (signing out must not leave this browser receiving the user's
 * notifications). Every failure is swallowed and answers `null`: this runs on the way out and must
 * never block it.
 */
export const unsubscribeBrowserPush = async (): Promise<string | null> => {
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
      return null
    }
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) {
      return null
    }
    const { endpoint } = subscription
    await subscription.unsubscribe()
    return endpoint
  } catch {
    return null
  }
}
