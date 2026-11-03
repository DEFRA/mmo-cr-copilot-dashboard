// Display names for the metric families in docs/design-system.md §2.1.
export const FAMILY_LABELS = {
  adoption: 'Adoption',
  assist: 'Assist',
  quality: 'Quality',
  speed: 'Speed',
  leverage: 'Leverage',
  risk: 'Risk',
  output: 'Output'
}

export const familyClass = (family) =>
  `app-family--${family in FAMILY_LABELS ? family : 'speed'}`
