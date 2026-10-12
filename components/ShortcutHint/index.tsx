'use client'

import { useSyncExternalStore } from 'react'
import { Kbd, KbdGroup } from '@/components/SCN/kbd'
import { isApplePlatform } from '@/lib/keyboard'
import styles from './styles.module.scss'

type ShortcutHintProps = {
  /** What the keys do, after them: "to post". */
  action: string
}

const subscribe = () => () => {}

const getPlatform = () =>
  (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
  navigator.platform

/**
 * "⌘ Enter to post" (Ctrl on other platforms) beside a submit button that `submitOnShortcut`
 * presses. It needs the platform, so it renders nothing on the server and appears once hydrated;
 * touch screens, which have no such keys, never show it. The button's `aria-keyshortcuts` is what
 * assistive tech reads, so the hint is hidden from it.
 */
export const ShortcutHint = ({ action }: ShortcutHintProps) => {
  const platform = useSyncExternalStore(subscribe, getPlatform, () => null)

  if (platform === null) {
    return null
  }

  return (
    <span className={styles.hint} aria-hidden="true">
      <KbdGroup>
        <Kbd>{isApplePlatform(platform) ? '⌘' : 'Ctrl'}</Kbd>
        <Kbd>Enter</Kbd>
      </KbdGroup>
      {action}
    </span>
  )
}
