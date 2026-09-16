import { useState } from 'react'
import { Panel } from './Panel'
import { useAuditLogs } from '../hooks/useAuditLogs'

const PAGE_SIZES = [10, 25, 50, 100]

const ACTION_LABEL = {
  'commit-classification.updated': 'Commit re-classified',
  'persona-mapping.upserted': 'Role assigned',
  'persona-mapping.deleted': 'Role removed'
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  })
}

function formatValue(value) {
  if (value == null) return '—'
  return Object.entries(value)
    .map(([key, v]) => `${key}: ${v}`)
    .join(', ')
}

/**
 * The audit trail — every change an operator has made through the dashboard,
 * newest first. Paged and filterable by a datetime window so a specific
 * change can be located without scrolling the whole history.
 *
 * The window is applied only when "Apply" is pressed, so typing into a
 * datetime input does not fire a request per keystroke.
 */
export function AuditLogPanel() {
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [rangeError, setRangeError] = useState(null)
  const [query, setQuery] = useState({
    from: null,
    to: null,
    page: 1,
    pageSize: PAGE_SIZES[1]
  })

  const { entries, page, total, totalPages, status, error, refresh } =
    useAuditLogs(query)

  const applyRange = (event) => {
    event.preventDefault()

    const from = fromInput ? new Date(fromInput) : null
    const to = toInput ? new Date(toInput) : null

    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime()))
    ) {
      setRangeError('Enter a valid date and time.')
      return
    }

    if (from && to && from.getTime() >= to.getTime()) {
      setRangeError('From must be before To.')
      return
    }

    setRangeError(null)
    setQuery((q) => ({
      ...q,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      page: 1
    }))
  }

  const clearRange = () => {
    setFromInput('')
    setToInput('')
    setRangeError(null)
    setQuery((q) => ({ ...q, from: null, to: null, page: 1 }))
  }

  const goToPage = (next) => setQuery((q) => ({ ...q, page: next }))

  return (
    <Panel
      title="Audit log"
      subtitle="Every change made from this dashboard — commit re-classifications and role mappings."
      action={
        <button
          type="button"
          onClick={refresh}
          className="focus-ring rounded-[0.6rem] border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
        >
          Refresh
        </button>
      }
    >
      <form
        onSubmit={applyRange}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
          From
          <input
            type="datetime-local"
            className="filter-input"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
          To
          <input
            type="datetime-local"
            className="filter-input"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-muted)]">
          Per page
          <select
            className="filter-input"
            value={query.pageSize}
            onChange={(e) =>
              setQuery((q) => ({
                ...q,
                pageSize: Number(e.target.value),
                page: 1
              }))
            }
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="focus-ring rounded-[0.6rem] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={clearRange}
          className="focus-ring rounded-[0.6rem] border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
        >
          Clear
        </button>
      </form>

      {rangeError && (
        <p
          role="alert"
          className="mb-3 text-xs font-medium text-[var(--color-danger)]"
        >
          {rangeError}
        </p>
      )}
      {status === 'error' && error && (
        <p
          role="alert"
          className="mb-3 text-xs font-medium text-[var(--color-danger)]"
        >
          Couldn't load the audit log: {error}
        </p>
      )}

      {status === 'loading' && entries.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          No audited changes in this time window.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Audited changes, newest first
              </caption>
              <thead>
                <tr className="text-xs text-[var(--color-text-muted)]">
                  <th scope="col" className="px-3 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Subject
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    From
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    To
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    By
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-text-muted)]">
                      {formatTimestamp(entry.occurredAt)}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)]">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)]">
                      {entry.entityId}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                      {formatValue(entry.before)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text)]">
                      {formatValue(entry.after)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                      {entry.actor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Audit log pages"
            className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]"
          >
            <span>
              Page {page} of {totalPages} · {total} change
              {total === 1 ? '' : 's'}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="focus-ring rounded-[0.6rem] border border-[var(--color-border)] px-2 py-1 font-medium transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="focus-ring rounded-[0.6rem] border border-[var(--color-border)] px-2 py-1 font-medium transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                Next
              </button>
            </span>
          </nav>
        </>
      )}
    </Panel>
  )
}
