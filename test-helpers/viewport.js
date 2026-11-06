/** A `matchMedia` stand-in for a wide screen with no motion preference. */
export function wideViewport(query) {
  return {
    matches: query.includes('min-width'),
    media: query,
    addEventListener() {},
    removeEventListener() {}
  }
}
