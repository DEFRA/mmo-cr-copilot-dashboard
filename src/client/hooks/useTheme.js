import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'copilot-dashboard-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return document.documentElement.getAttribute('data-theme') || 'light'
}

function applyThemeAttr(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/**
 * Manages the active light/dark theme, persists the choice, and reflects it on
 * <html data-theme>. Charts subscribe to `theme` to recompute their palette.
 *
 * The `data-theme` attribute is applied *synchronously during render* (not in
 * an effect). Charts read design-token CSS custom properties via
 * getComputedStyle while they render; if the attribute were only updated in an
 * effect (after commit), a freshly-remounted chart would read the previous
 * theme's colours — producing unreadable text-on-background right after a
 * toggle. Setting it during render guarantees the palette is correct before any
 * child chart reads it. The write is idempotent.
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  applyThemeAttr(theme)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
