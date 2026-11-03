import { createContext, useContext } from 'react'

/** Marker views pass as a chart chip; rendered as the current period's label. */
export const PERIOD_CHIP = 'Selected period'

export const PeriodLabelContext = createContext(PERIOD_CHIP)

/** "Live sprint" while the dashboard is live, otherwise "Selected period". */
export function PeriodChip() {
  return <span className="app-mini-tag">{useContext(PeriodLabelContext)}</span>
}
