/**
 * Headline metric tile. Encodes status with a token colour AND a text label /
 * icon — never colour alone. Optional footnote adds supporting context. When an
 * `onClick` handler is supplied the whole tile becomes an accessible button.
 * An optional `info` string renders a small "?" affordance in the top-right
 * corner that reveals the KPI's definition on hover/focus.
 */
export function KpiCard({
  label,
  value,
  unit = '',
  accent = 'var(--color-primary)',
  icon,
  delta = null,
  footnote,
  info,
  onClick,
  expanded,
  controls,
  dimmed = false
}) {
  const interactive = typeof onClick === 'function'
  const Tag = interactive ? 'button' : 'article'
  const baseClass = `kpi-card${info ? ' kpi-card--has-info' : ''}${dimmed ? ' kpi-card--dimmed' : ''}`
  const interactiveProps = interactive
    ? {
        type: 'button',
        onClick,
        disabled: dimmed,
        'aria-expanded': expanded,
        'aria-controls': controls,
        className: `${baseClass} kpi-card--button focus-ring`
      }
    : { className: baseClass, 'aria-hidden': dimmed || undefined }
  // The info trigger is a sibling <button>, never a descendant of `Tag` —
  // nesting an interactive control inside another (when Tag is a button)
  // would be invalid HTML and unreachable for assistive tech.
  const tooltipId = info
    ? `kpi-info-${label.replace(/\s+/g, '-').toLowerCase()}`
    : undefined

  return (
    <div className="kpi-card-slot">
      <Tag {...interactiveProps} style={{ '--kpi-accent': accent }}>
        <span
          className="kpi-card__accent"
          aria-hidden="true"
          style={{ background: accent }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            {label}
          </span>
          {icon && (
            <span
              aria-hidden="true"
              className="text-base"
              style={{ color: accent }}
            >
              {icon}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tabular-nums text-[var(--color-text)]">
            {value}
          </span>
          {unit && (
            <span className="text-sm font-medium text-[var(--color-text-muted)]">
              {unit}
            </span>
          )}
        </div>
        {delta && (
          <span
            className="pill w-fit"
            style={{ color: delta.color, borderColor: delta.color }}
          >
            <span aria-hidden="true">{delta.icon}</span>
            {delta.text}
          </span>
        )}
        {footnote && (
          <p className="m-0 text-xs text-[var(--color-text-faint)]">
            {footnote}
          </p>
        )}
        {interactive && (
          <span className="mt-1 text-xs font-medium text-[var(--color-primary)]">
            {expanded ? 'Hide breakdown ▲' : 'Show breakdown ▼'}
          </span>
        )}
      </Tag>
      {info && (
        <div className="kpi-info">
          <button
            type="button"
            className="kpi-info__trigger focus-ring"
            aria-describedby={tooltipId}
          >
            <span aria-hidden="true">?</span>
            <span className="sr-only">{`About ${label}`}</span>
          </button>
          <span role="tooltip" id={tooltipId} className="kpi-info__tooltip">
            {info}
          </span>
        </div>
      )}
    </div>
  )
}
