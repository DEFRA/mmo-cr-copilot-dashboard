import { useEffect, useRef, useState } from 'react'
import { toDateTimeLocal } from '../lib/sprints'

/**
 * Global time-window control that lives in the header. Offers sprint presets
 * and quick ranges, plus a custom calendar + time range. Selecting the live
 * preset (or the header Live indicator) returns the dashboard to live mode.
 *
 * Controlled entirely by the parent: the active window (`start`/`end`) and the
 * `mode` come in as props; user actions are reported via `onGoLive` /
 * `onApplyRange`.
 */
export function DateRangeFilter({
  start,
  end,
  label,
  presets,
  onGoLive,
  onApplyRange
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(() => toDateTimeLocal(start))
  const [to, setTo] = useState(() => toDateTimeLocal(end))
  const [error, setError] = useState('')
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  // Keep the custom inputs in sync with the active window.
  useEffect(() => {
    setFrom(toDateTimeLocal(start))
    setTo(toDateTimeLocal(end))
    setError('')
  }, [start, end])

  // Close on outside click or Escape while open.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Move focus into the dialog on open so a keyboard user lands on its first
  // control rather than continuing past it.
  useEffect(() => {
    if (!open) return
    popoverRef.current?.querySelector('button, input')?.focus()
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const choosePreset = (preset) => {
    if (preset.isLive) onGoLive()
    else onApplyRange(preset.start, preset.end)
    close()
  }

  const applyCustom = () => {
    const s = new Date(from)
    const e = new Date(to)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      setError('Enter a valid start and end.')
      return
    }
    if (s.getTime() >= e.getTime()) {
      setError('Start must be before end.')
      return
    }
    onApplyRange(s, e)
    close()
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="pill focus-ring"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Change the dashboard time window"
      >
        <span aria-hidden="true">🗓</span>
        <span className="max-w-[11rem] truncate">{label}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          className="filter-popover"
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label="Select time window"
        >
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Quick ranges
          </p>
          <div className="flex flex-col gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => choosePreset(preset)}
                className="focus-ring flex items-center justify-between gap-2 rounded-[0.6rem] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-left text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)]"
              >
                <span className="font-medium">{preset.label}</span>
                {preset.isLive && (
                  <span
                    className="pill"
                    style={{ color: 'var(--color-success)' }}
                  >
                    Live
                  </span>
                )}
              </button>
            ))}
          </div>

          <p className="m-0 mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Custom range
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
              From
              <input
                type="datetime-local"
                className="filter-input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
              To
              <input
                type="datetime-local"
                className="filter-input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            {error && (
              <p
                className="m-0 text-xs font-medium text-[var(--color-danger)]"
                role="alert"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={applyCustom}
              className="focus-ring mt-1 rounded-[0.6rem] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Apply custom range
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
