import { useEffect } from 'react'

// Lazy views and late data grow the page; keep trying for about a second.
const MAX_FRAMES = 60

/** Scrolls to the pending target; true once done or given up. */
function scrollToTarget(target, frame) {
  if (target.section) {
    const el = document.getElementById(target.section)
    el?.scrollIntoView?.({ block: 'start' })
    return Boolean(el)
  }
  const tallEnough =
    document.documentElement.scrollHeight >= target.y + window.innerHeight
  if (tallEnough || frame > MAX_FRAMES) {
    window.scrollTo?.(0, target.y)
    return true
  }
  return false
}

export function useScrollRestoration(pendingScroll, deps) {
  useEffect(() => {
    const target = pendingScroll.current
    if (!target) {
      return undefined
    }
    let frame = 0
    let id
    const attempt = () => {
      if (scrollToTarget(target, frame)) {
        pendingScroll.current = null
        return
      }
      frame += 1
      if (frame <= MAX_FRAMES) {
        id = window.requestAnimationFrame(attempt)
      }
    }
    id = window.requestAnimationFrame(attempt)
    return () => window.cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
