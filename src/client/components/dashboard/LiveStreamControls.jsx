import { useState } from 'react'

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js'
import { cx } from '../govuk/utils.js'
import { Icon } from './Icon.jsx'

/** Live stream pause state: paused by default when the user prefers reduced motion. */
export function useLiveStreamPaused() {
  const reduced = usePrefersReducedMotion()
  const [choice, setChoice] = useState(null)
  const paused = choice ?? reduced

  return [paused, () => setChoice((prev) => !(prev ?? reduced))]
}

/** Live badge and Pause/Resume button (WCAG 2.2.2; no aria-pressed). */
export function LiveStreamControls({ paused, onToggle, className }) {
  return (
    <div
      className={cx(
        'app-live-controls',
        paused && 'app-live--paused',
        className
      )}
    >
      <span className="app-badge app-badge--live">
        <span className="app-pulse" aria-hidden="true" />
        {paused ? 'Paused' : 'Live'}
      </span>
      <button type="button" className="app-chip app-chip--s" onClick={onToggle}>
        <Icon name={paused ? 'play' : 'pause'} size={14} />
        {paused ? 'Resume animation' : 'Pause animation'}
      </button>
    </div>
  )
}
