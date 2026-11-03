/**
 * `matchMedia` stand-in where only `prefers-reduced-motion: reduce` matches.
 * Records listeners so a test can flip the preference.
 */
export function reducedMotion(matches = true) {
  const listeners = new Set()
  const state = { matches }

  const matchMedia = (query) => ({
    get matches() {
      return query.includes('prefers-reduced-motion') && state.matches
    },
    media: query,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener)
  })

  const set = (next) => {
    state.matches = next
    listeners.forEach((listener) => listener())
  }

  return { matchMedia, set, listeners }
}
