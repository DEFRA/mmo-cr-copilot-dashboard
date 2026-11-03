import { useEffect, useId, useRef, useState } from 'react'

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js'
import { cx } from '../govuk/utils.js'
import { FAMILY_LABELS, familyClass } from './families.js'
import { Icon } from './Icon.jsx'

const ARROWS = { up: '▲', down: '▼', flat: '■' }
const TONES = {
  good: 'improved',
  bad: 'worsened',
  flat: 'no meaningful change'
}
const NUMBER = /^([+−-]?)([\d,]*\.?\d+)$/
const COUNT_MS = 900
const STAGGER_MS = 80

/** Direction and tone are independent: a falling cycle time is good. */
export function Delta({ direction = 'flat', tone = 'flat', children }) {
  return (
    <p className={cx('app-delta', `app-delta--${tone}`)}>
      <span aria-hidden="true">{ARROWS[direction]}</span>
      {children}
      <span className="govuk-visually-hidden"> ({TONES[tone]})</span>
    </p>
  )
}

// Counts the visible value up once on load; screen readers get the final value only.
function useCountUp(text, enabled, delay) {
  const match = enabled ? NUMBER.exec(String(text)) : null
  const [frame, setFrame] = useState(() => (match ? `${match[1]}0` : null))
  const done = useRef(!match)

  useEffect(() => {
    const parts = NUMBER.exec(String(text))
    if (done.current || !parts) return undefined

    const target = Number.parseFloat(parts[2].replaceAll(',', ''))
    const decimals = (parts[2].split('.')[1] ?? '').length
    const format = (v) =>
      parts[1] +
      v.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: parts[2].includes(',')
      })

    let id
    let start
    const step = (time) => {
      start ??= time + delay
      const progress = Math.min(1, Math.max(0, (time - start) / COUNT_MS))
      if (progress < 1) {
        setFrame(format(target * (1 - (1 - progress) ** 3)))
        id = requestAnimationFrame(step)
      } else {
        done.current = true
        setFrame(null)
      }
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [text, delay])

  return frame ?? text
}

/** Capitalises each word; acronyms such as "PR" are left as written. */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'vs'
])

export const titleCase = (text) =>
  String(text).replace(/(^|\s)([a-z][\w-]*)/g, (match, gap, word, offset) =>
    offset > 0 && MINOR_WORDS.has(word)
      ? match
      : gap + word[0].toUpperCase() + word.slice(1)
  )

/** Title Case for string headings; JSX (used to keep an identifier as written) passes through. */
export const headingCase = (node) =>
  typeof node === 'string' ? titleCase(node) : node

/**
 * KPI card: 8px family band, icon tile, value, unit, delta and a decorative
 * mini chart. With `onClick` or `href` the label becomes the card's one action.
 */
export function KpiCard({
  label,
  value,
  unit,
  family = 'speed',
  familyLabel,
  showFamily = true,
  icon,
  sub,
  delta,
  badge,
  chart,
  headingLevel = 3,
  href,
  onClick,
  expanded = false,
  controls,
  actionText,
  dimmed = false,
  index = 0,
  compact = false
}) {
  const labelId = useId()
  const reduced = usePrefersReducedMotion()
  const delay = index * STAGGER_MS
  const shown = useCountUp(value, !reduced, delay)
  const Heading = `h${headingLevel}`
  const clickable = Boolean(onClick || href)
  const hidden = actionText && (
    <span className="govuk-visually-hidden">, {actionText}</span>
  )

  let action = titleCase(label)
  if (onClick) {
    action = (
      <button
        type="button"
        className="app-kpi__action"
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onClick}
      >
        {titleCase(label)}
        {hidden}
      </button>
    )
  } else if (href) {
    action = (
      <a className="app-kpi__action" href={href}>
        {titleCase(label)}
        {hidden}
      </a>
    )
  }

  return (
    <article
      className={cx(
        'app-kpi',
        familyClass(family),
        clickable && 'app-kpi--action',
        expanded && 'app-kpi--open',
        dimmed && 'app-kpi--dimmed',
        !reduced && 'app-anim-rise'
      )}
      style={{ '--d': `${delay}ms` }}
      aria-labelledby={labelId}
    >
      <div className="app-kpi__head">
        {icon && (
          <span className="app-kpi__icon">
            <Icon name={icon} />
          </span>
        )}
        <Heading className="app-kpi__label" id={labelId}>
          {action}
        </Heading>
        {showFamily && (
          <span className="app-kpi__family">
            {familyLabel ?? FAMILY_LABELS[family]}
          </span>
        )}
        {clickable && (
          <span className="app-kpi__chevron" aria-hidden="true">
            ›
          </span>
        )}
      </div>
      <div className="app-kpi__body">
        <p className={cx('app-kpi__value', compact && 'app-kpi__value--m')}>
          <span aria-hidden="true">{shown}</span>
          <span className="govuk-visually-hidden">{value}</span>
          {unit && <span className="app-kpi__unit">{unit}</span>}
        </p>
        {chart && <span className="app-kpi__viz">{chart}</span>}
      </div>
      {sub && <p className="app-kpi__sub">{sub}</p>}
      {(delta || badge) && (
        <div className="app-kpi__foot">
          {delta && (
            <Delta direction={delta.direction} tone={delta.tone}>
              {delta.text}
            </Delta>
          )}
          {badge && <span className="app-mini-tag">{badge}</span>}
        </div>
      )}
    </article>
  )
}
