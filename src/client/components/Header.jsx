import { DateRangeFilter } from './DateRangeFilter'

/**
 * Live/custom status indicator. In live mode it is a non-interactive green
 * badge ("Already streaming live data"); once a custom window is selected it
 * turns red and becomes a button that returns the dashboard to live.
 */
function LiveIndicator({ mode, connected, onGoLive }) {
  const isLive = mode === 'live'
  const color = isLive
    ? connected
      ? 'var(--color-success)'
      : 'var(--color-warning)'
    : 'var(--color-danger)'
  const label = isLive
    ? connected
      ? 'Live'
      : 'Live · reconnecting'
    : 'Custom range'

  if (isLive) {
    return (
      <span
        className="live-pill"
        style={{ color }}
        title="Already streaming live data"
      >
        <span
          className={`live-dot${connected ? ' live-dot--pulse' : ''}`}
          aria-hidden="true"
        />
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      className="live-pill focus-ring"
      style={{ color }}
      onClick={onGoLive}
      title="Click to go to live data"
    >
      <span className="live-dot" aria-hidden="true" />
      {label}
    </button>
  )
}

/**
 * App header: title, global time-window filter, live/custom indicator, freshness
 * timestamp, and a theme toggle. Status is always conveyed with icon + text,
 * never colour alone.
 */
export function Header({
  theme,
  onToggleTheme,
  lastUpdated,
  connection = 'live',
  filter,
  presets,
  onGoLive,
  onApplyRange,
  onOpenSettings
}) {
  const connected = connection === 'live'

  return (
    <header className="relative z-50 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/80 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-card)] text-lg"
          style={{
            background:
              'linear-gradient(150deg, var(--color-copilot), var(--color-accent))',
            color: 'white'
          }}
        >
          ✦
        </span>
        <div>
          <h1 className="text-base font-semibold leading-tight text-[var(--color-text)]">
            MMO Catch Recording Code Delivery Insights
          </h1>
          <p className="m-0 text-xs text-[var(--color-text-muted)]">
            Accelerated delivery using GitHub Copilot
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filter && (
          <>
            <DateRangeFilter
              start={filter.start}
              end={filter.end}
              label={filter.label}
              presets={presets}
              onGoLive={onGoLive}
              onApplyRange={onApplyRange}
            />
            <LiveIndicator
              mode={filter.mode}
              connected={connected}
              onGoLive={onGoLive}
            />
          </>
        )}
        {lastUpdated && (
          <span className="hidden text-xs text-[var(--color-text-muted)] lg:inline">
            Updated {lastUpdated}
          </span>
        )}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="focus-ring grid h-9 w-9 place-items-center rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)]"
          >
            {/* Feather-style gear, drawn bold (stroke-width 2.5) rather than relying on font glyph weight. */}
            <svg
              aria-hidden="true"
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          data-theme={theme}
          className="theme-toggle focus-ring"
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            ☀
          </span>
          <span className="theme-toggle__icon" aria-hidden="true">
            ☾
          </span>
          <span className="theme-toggle__thumb" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
