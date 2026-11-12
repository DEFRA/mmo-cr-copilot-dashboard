import { useCallback, useEffect, useRef, useState } from 'react'

import { fromHash, isGlobalLevel, toHash } from '../lib/routes'
import { confirmDiscard } from '../lib/unsaved'
import { withProject } from './navigation.js'

function pushHash(next) {
  window.history.replaceState(
    { ...window.history.state, scrollY: window.scrollY },
    ''
  )
  const hash = toHash(next)
  if (window.location.hash !== hash) {
    window.history.pushState(
      { scrollY: 0, section: next.section ?? null },
      '',
      hash
    )
  }
}

/** Keeps the page in sync with the URL hash, guarding unsaved changes. */
function useLocationChanges(shownHash, unsaved, pendingScroll, setNav) {
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
    // A hash link or Back fires popstate and hashchange; the second sees the hash already shown.
    const onLocationChange = () => {
      const hash = window.location.hash
      if (hash !== shownHash.current && !confirmDiscard(unsaved.current)) {
        window.history.replaceState(
          window.history.state,
          '',
          shownHash.current || window.location.pathname + window.location.search
        )
        return
      }
      shownHash.current = hash
      setNav(fromHash(hash))
      pendingScroll.current = { y: window.history.state?.scrollY ?? 0 }
    }
    window.addEventListener('popstate', onLocationChange)
    window.addEventListener('hashchange', onLocationChange)
    return () => {
      window.removeEventListener('popstate', onLocationChange)
      window.removeEventListener('hashchange', onLocationChange)
    }
  }, [shownHash, unsaved, pendingScroll, setNav])
}

/**
 * The current page from the URL hash, and `navigate` to move between pages.
 * Every project page carries its project in the URL.
 */
export function useHashNavigation(activeSlug) {
  const [nav, setNav] = useState(() => fromHash(window.location.hash))
  const pendingScroll = useRef(null)
  const shownHash = useRef(window.location.hash)
  const unsaved = useRef(false)
  const setUnsaved = useCallback((dirty) => {
    unsaved.current = dirty
  }, [])

  const navigate = useCallback(
    (target, { confirmed = false } = {}) => {
      if (!confirmed && !confirmDiscard(unsaved.current)) {
        return
      }
      const next = withProject(target, activeSlug)
      pushHash(next)
      shownHash.current = window.location.hash
      pendingScroll.current = next.section
        ? { section: next.section }
        : { y: 0 }
      setNav(next)
    },
    [activeSlug]
  )

  useLocationChanges(shownHash, unsaved, pendingScroll, setNav)

  // A legacy or unscoped link gets the active project written into the URL.
  useEffect(() => {
    if (isGlobalLevel(nav.level) || nav.project || !activeSlug) {
      return
    }
    const canonical = { ...nav, project: activeSlug }
    window.history.replaceState(window.history.state, '', toHash(canonical))
    shownHash.current = window.location.hash
    setNav(canonical)
  }, [nav, activeSlug])

  return { nav, navigate, setUnsaved, pendingScroll }
}
