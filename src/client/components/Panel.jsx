/**
 * Consistent panel chrome for every dashboard tile. Handles the four required
 * states: loading (skeleton), empty, error, and populated (children).
 */
export function Panel({
  title,
  subtitle,
  action = null,
  state = 'populated',
  className = '',
  bodyClassName = '',
  children
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel__head">
          <div className="flex flex-col gap-0.5">
            {title && (
              <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="m-0 text-xs text-[var(--color-text-muted)]">
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={`panel__body ${bodyClassName}`}>
        {state === 'loading' && <PanelSkeleton />}
        {state === 'empty' && (
          <PanelMessage
            icon="◔"
            title="No data yet"
            message="Metrics will appear here as PR builds are processed."
          />
        )}
        {state === 'error' && (
          <PanelMessage
            icon="⚠"
            tone="danger"
            title="Couldn't load metrics"
            message="Something went wrong while rendering this panel."
          />
        )}
        {state === 'populated' && children}
      </div>
    </section>
  )
}

function PanelSkeleton() {
  return (
    <div className="flex h-full min-h-40 flex-col gap-3 p-2" aria-hidden="true">
      <div className="h-4 w-1/3 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
      <div className="flex-1 animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface-2)]" />
    </div>
  )
}

function PanelMessage({ icon, title, message, tone = 'muted' }) {
  const color =
    tone === 'danger' ? 'var(--color-danger)' : 'var(--color-text-muted)'
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden="true" className="text-2xl" style={{ color }}>
        {icon}
      </span>
      <p className="m-0 text-sm font-semibold text-[var(--color-text)]">
        {title}
      </p>
      <p className="m-0 max-w-xs text-xs text-[var(--color-text-muted)]">
        {message}
      </p>
    </div>
  )
}
