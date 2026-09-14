/**
 * Accessible breadcrumb trail for drill-down navigation. Each crumb except the
 * last is a button that jumps back to that level. When depth > 1, a ← Back
 * shortcut and a ⌂ Home button are rendered for quick navigation.
 */
export function Breadcrumb({ items, onNavigate }) {
  const isDeep = items.length > 1
  const parent = isDeep ? items[items.length - 2] : null
  const home = items[0]

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Quick-nav buttons visible when drilling down */}
      {isDeep && (
        <div
          className="flex items-center gap-1.5"
          aria-label="Quick navigation"
        >
          <button
            type="button"
            onClick={() => onNavigate(parent)}
            aria-label={`Back to ${parent.label}`}
            className="focus-ring inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-primary)]"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
          {items.length > 2 && (
            <button
              type="button"
              onClick={() => onNavigate(home)}
              aria-label="Go to home overview"
              className="focus-ring inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-primary)]"
            >
              <span aria-hidden="true">⌂</span>
              Home
            </button>
          )}
          <span
            aria-hidden="true"
            className="h-4 w-px bg-[var(--color-border)]"
          />
        </div>
      )}

      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm">
          {items.map((item, i) => {
            const isLast = i === items.length - 1
            return (
              <li key={item.key} className="flex items-center gap-1.5">
                {isLast ? (
                  <span
                    aria-current="page"
                    className="font-semibold text-[var(--color-text)]"
                  >
                    {item.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(item)}
                    className="focus-ring rounded px-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
                  >
                    {item.label}
                  </button>
                )}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="text-[var(--color-text-faint)]"
                  >
                    /
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </div>
  )
}
