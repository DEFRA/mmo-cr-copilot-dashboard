import { useState } from 'react'

import { Panel, PanelState } from './dashboard'
import {
  Button,
  DateInput,
  ErrorSummary,
  NotificationBanner,
  Pagination,
  Select,
  Table
} from './govuk'
import { useAuditLogs } from '../hooks/useAuditLogs'

const DEFAULT_PAGE_SIZE = 25
const LARGE_PAGE_SIZE = 50
const PAGE_SIZES = [10, DEFAULT_PAGE_SIZE, LARGE_PAGE_SIZE, 100]
const HALF_DAY_HOURS = 12
const LAST_HOUR = 23
const LAST_MINUTE = 59
const LAST_MS = 999
const FROM_ID = 'audit-from'
const TO_ID = 'audit-to'
const PARTS = ['day', 'month', 'year']

const ACTION_LABEL = {
  'commit-classification.updated': 'Commit re-classified',
  'persona-mapping.upserted': 'Persona assigned',
  'persona-mapping.deleted': 'Persona removed',
  'repository.mapped': 'Repository added',
  'repository.remapped': 'Repository moved',
  'repository.unmapped': 'Repository removed',
  'project.created': 'Project created',
  'project.updated': 'Project changed',
  'project.archived': 'Project archived',
  'project.user-groups.updated': 'User groups changed',
  'role-mapping.created': 'Role mapping added',
  'role-mapping.updated': 'Role mapping changed',
  'role-mapping.deleted': 'Role mapping removed',
  'role-mapping.migrated': 'Role mappings migrated',
  'pr-jira-links.updated': 'Jira links changed',
  'complexity-model.updated': 'Complexity model changed',
  'sprint-calendar.updated': 'Sprint period changed'
}

function formatWhen(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
  const hours = d.getHours() % HALF_DAY_HOURS || HALF_DAY_HOURS
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const meridiem = d.getHours() < HALF_DAY_HOURS ? 'am' : 'pm'
  return `${date}, ${hours}:${minutes}${meridiem}`
}

// The backend records the actor as `{ oid, name }`; older entries hold a plain string.
export function actorLabel(actor) {
  if (typeof actor === 'string') {
    return actor
  }
  return actor?.name || actor?.oid || 'Unknown'
}

function formatValue(value) {
  if (value == null) {
    return '—'
  }
  return Object.entries(value)
    .map(([key, v]) => `${key}: ${v}`)
    .join(', ')
}

/** Parses a GOV.UK date input value into a Date, or an error and the fields at fault. */
function parseDate(value, label) {
  const parts = PARTS.map((key) => String(value[key] ?? '').trim())
  if (parts.every((p) => !p)) {
    return {}
  }

  const missing = PARTS.filter((_, i) => !parts[i])
  if (missing.length > 0) {
    return {
      error: `${label} must include a ${missing.join(' and ')}`,
      fields: missing
    }
  }

  const [day, month, year] = parts.map(Number)
  const date = new Date(year, month - 1, day)
  const real =
    parts.every((p) => /^\d+$/.test(p)) &&
    year >= 1000 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  return real
    ? { date }
    : { error: `${label} must be a real date`, fields: PARTS }
}

function pageItems(page, totalPages, goTo) {
  const numbers = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b)

  return numbers.flatMap((number, i) => {
    const item = {
      number,
      current: number === page,
      onClick: () => goTo(number)
    }
    return i > 0 && number - numbers[i - 1] > 1
      ? [{ ellipsis: true }, item]
      : [item]
  })
}

function filterErrors(from, to) {
  const found = {}
  if (from.error) {
    found.from = from
  }
  if (to.error) {
    found.to = to
  }
  if (from.date && to.date && from.date > to.date) {
    found.to = {
      error: 'Date to must be the same as or after date from',
      fields: PARTS
    }
  }
  return found
}

/** The filter as ISO bounds; `to` covers the whole of its day. */
function filterRange(from, to) {
  const end = to.date ? new Date(to.date) : null
  end?.setHours(LAST_HOUR, LAST_MINUTE, LAST_MINUTE, LAST_MS)
  return {
    from: from.date ? from.date.toISOString() : null,
    to: end ? end.toISOString() : null
  }
}

const errorLink = (id, found) =>
  found && { href: `#${id}-${found.fields[0]}`, text: found.error }

function listState(entries, status) {
  if (entries.length > 0) {
    return 'populated'
  }
  if (status === 'error') {
    return 'error'
  }
  return status === 'loading' || status === 'idle' ? 'loading' : 'empty'
}

/**
 * The audit trail of every change made through the dashboard, newest first,
 * paged and filterable by date. The filter applies only on submit.
 */
export function AuditLogPanel({ projectSlug }) {
  const [fromInput, setFromInput] = useState({})
  const [toInput, setToInput] = useState({})
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState({
    from: null,
    to: null,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE
  })

  const { entries, page, total, totalPages, status, refresh } = useAuditLogs({
    projectSlug,
    ...query
  })

  const applyFilter = (event) => {
    event.preventDefault()
    const from = parseDate(fromInput, 'Date from')
    const to = parseDate(toInput, 'Date to')
    const found = filterErrors(from, to)

    setAttempt((n) => n + 1)
    setErrors(found)
    if (found.from || found.to) {
      return
    }

    setQuery((q) => ({ ...q, ...filterRange(from, to), page: 1 }))
  }

  const clearFilter = () => {
    setFromInput({})
    setToInput({})
    setErrors({})
    setQuery((q) => ({ ...q, from: null, to: null, page: 1 }))
  }

  const goToPage = (next) => setQuery((q) => ({ ...q, page: next }))

  const errorList = [
    errorLink(FROM_ID, errors.from),
    errorLink(TO_ID, errors.to)
  ].filter(Boolean)
  const state = listState(entries, status)

  return (
    <Panel
      title="Audit log"
      family="speed"
      icon="layers"
      headingLevel={2}
      busy={state === 'loading'}
      actions={
        <Button
          variant="secondary"
          className="govuk-!-margin-bottom-0"
          onClick={refresh}
        >
          Refresh<span className="govuk-visually-hidden"> audit log</span>
        </Button>
      }
    >
      <p className="govuk-body-s">
        Every change made from this dashboard: commit re-classifications and
        persona mappings.
      </p>

      {errorList.length > 0 && (
        <ErrorSummary key={attempt} errors={errorList} />
      )}

      <form onSubmit={applyFilter} noValidate>
        <div className="app-grid">
          <div className="app-span-6">
            <DateInput
              id={FROM_ID}
              legend="Date from"
              legendSize="s"
              hint="For example, 27 3 2026"
              errorMessage={errors.from?.error}
              errorFields={errors.from?.fields}
              value={fromInput}
              onChange={setFromInput}
            />
          </div>
          <div className="app-span-6">
            <DateInput
              id={TO_ID}
              legend="Date to"
              legendSize="s"
              hint="For example, 31 3 2026"
              errorMessage={errors.to?.error}
              errorFields={errors.to?.fields}
              value={toInput}
              onChange={setToInput}
            />
          </div>
        </div>
        <Select
          id="audit-page-size"
          label="Results per page"
          value={query.pageSize}
          onChange={(e) =>
            setQuery((q) => ({
              ...q,
              pageSize: Number(e.target.value),
              page: 1
            }))
          }
          options={PAGE_SIZES.map((size) => ({
            value: size,
            text: String(size)
          }))}
        />
        <div className="govuk-button-group">
          <Button type="submit">Apply filter</Button>
          <Button variant="secondary" onClick={clearFilter}>
            Clear filter
          </Button>
        </div>
      </form>

      {status === 'error' && entries.length > 0 && (
        <NotificationBanner headingLevel={3}>
          We could not refresh the audit log. Showing the last page loaded.
        </NotificationBanner>
      )}

      <PanelState
        state={state}
        title="Audit log"
        icon="layers"
        emptyTag="No changes"
        emptyMessage="No audited changes in this period."
        errorMessage="We could not load the audit log. Try again later."
        onRetry={refresh}
      >
        <p className="govuk-body-s" aria-live="polite">
          Page {page} of {totalPages} · {total} change{total === 1 ? '' : 's'}
        </p>
        <Table
          className="govuk-!-margin-bottom-0"
          caption="Audited changes, newest first"
          captionHidden
          head={[
            { id: 'when', label: 'When' },
            { id: 'action', label: 'Action' },
            { id: 'subject', label: 'Subject' },
            { id: 'from', label: 'From' },
            { id: 'to', label: 'To' },
            { id: 'by', label: 'By' }
          ]}
          rows={entries.map((entry) => ({
            id: entry.id,
            cells: [
              formatWhen(entry.occurredAt),
              ACTION_LABEL[entry.action] ?? entry.action,
              entry.entityId,
              formatValue(entry.before),
              formatValue(entry.after),
              actorLabel(entry.actor)
            ]
          }))}
        />
        {totalPages > 1 && (
          <Pagination
            landmarkLabel="Audit log pages"
            previous={page > 1 ? { onClick: () => goToPage(page - 1) } : null}
            next={
              page < totalPages ? { onClick: () => goToPage(page + 1) } : null
            }
            items={pageItems(page, totalPages, goToPage)}
          />
        )}
      </PanelState>
    </Panel>
  )
}
