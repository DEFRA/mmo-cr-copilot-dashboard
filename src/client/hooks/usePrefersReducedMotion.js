import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

const mediaQuery = () => window.matchMedia?.(QUERY)

function subscribe(onChange) {
  const query = mediaQuery()
  query?.addEventListener?.('change', onChange)
  return () => query?.removeEventListener?.('change', onChange)
}

const getSnapshot = () => Boolean(mediaQuery()?.matches)

/** True while the user asks the operating system for reduced motion. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
