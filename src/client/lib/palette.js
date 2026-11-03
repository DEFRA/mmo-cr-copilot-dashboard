/**
 * Reads the design-token custom properties (`--app-*`) from the document root
 * into colour values ECharts can use.
 */

function read(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim()
}

export const APP_FAMILIES = [
  'adoption',
  'assist',
  'quality',
  'speed',
  'leverage',
  'risk',
  'output'
]

/** `--app-motion-duration` in milliseconds (0 when the token is missing). */
export function getMotionDuration() {
  return Number.parseFloat(read('--app-motion-duration')) || 0
}

/** The GOV.UK design tokens (`--app-*`) from docs/design-system.md, for ECharts. */
export function getAppPalette() {
  return {
    text: read('--app-colour-text'),
    muted: read('--app-colour-text-muted'),
    grid: read('--app-colour-line'),
    axis: read('--app-colour-text-muted'),
    white: read('--app-colour-white'),
    neutral: read('--app-colour-neutral-tint'),
    brand: read('--app-colour-brand'),
    brandInk: read('--app-colour-brand-ink'),
    error: read('--app-colour-error'),
    warning: read('--app-size-l'),
    font: 'Arial, Helvetica, sans-serif',
    categorical: [1, 2, 3, 4, 5, 6].map((n) => read(`--app-chart-${n}`)),
    copilot: read('--app-colour-copilot'),
    human: read('--app-colour-human'),
    family: Object.fromEntries(
      APP_FAMILIES.map((name) => [
        name,
        {
          band: read(`--app-colour-${name}`),
          ink: read(`--app-colour-${name}-ink`),
          tint: read(`--app-colour-${name}-tint`)
        }
      ])
    )
  }
}
