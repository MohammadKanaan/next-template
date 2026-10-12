import type { KeyboardEvent } from 'react'

/** The `aria-keyshortcuts` of a submit button that `submitOnShortcut` presses. */
export const SUBMIT_KEYSHORTCUTS = 'Meta+Enter Control+Enter'

/** ⌘ + Enter or Ctrl + Enter (either works on every platform), outside an IME composition. */
export const isSubmitShortcut = (event: KeyboardEvent) =>
  event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing

/**
 * A form's `onKeyDown`: ⌘/Ctrl + Enter submits it from any field, a textarea included, as its
 * submit button would. Nothing happens while that button is disabled (a save in flight).
 */
export const submitOnShortcut = (event: KeyboardEvent<HTMLFormElement>) => {
  if (!isSubmitShortcut(event)) {
    return
  }
  event.preventDefault()
  const form = event.currentTarget
  const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (submitter?.disabled) {
    return
  }
  form.requestSubmit(submitter)
}

/** Whether a key press lands in something the visitor types into, where one-key shortcuts wait. */
export const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Apple platforms name the modifier ⌘; everything else Ctrl. */
export const isApplePlatform = (platform: string) => /mac|iphone|ipad|ipod/i.test(platform)
