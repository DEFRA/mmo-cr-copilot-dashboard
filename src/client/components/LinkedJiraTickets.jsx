import { useCallback, useEffect, useId, useState } from 'react'

import { Panel } from './dashboard'
import { Button, ErrorMessage } from './govuk'
import { cx } from './govuk/utils.js'
import { apiFetch, jsonWrite } from '../lib/api'
import { checkedWrite } from '../lib/api-errors'

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/
const MAX_KEYS = 20

const parseKeys = (value) => [
  ...new Set(
    value
      .split(',')
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean)
  )
]

function keyError(keys) {
  if (keys.length > MAX_KEYS) {
    return `Enter ${MAX_KEYS} Jira tickets or fewer`
  }
  const bad = keys.find((k) => !ISSUE_KEY.test(k))
  return bad
    ? `${bad} is not a Jira ticket key. Use the form MMO-123, separated by commas`
    : null
}

function KeyList({ keys }) {
  if (keys.length === 0) {
    return <span className="app-muted">None</span>
  }
  return (
    <ul className="app-quick" aria-label="Jira tickets">
      {keys.map((key) => (
        <li key={key}>
          <span className="app-badge app-badge--ticket">{key}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Jira tickets linked to a pull request: keys found in its branch, title and
 * commits, plus links an admin adds by hand (E5-S2). Admins edit only the
 * manual links; every change is audited by the backend.
 */
export function LinkedJiraTickets({
  projectSlug,
  repository,
  prNumber,
  payloadKeys = [],
  canEdit = false
}) {
  const inputId = useId()
  const [links, setLinks] = useState([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const path = `/api/projects/${encodeURIComponent(projectSlug)}/pr-links/${encodeURIComponent(repository)}/${prNumber}`

  useEffect(() => {
    if (!projectSlug) {
      return undefined
    }
    const controller = new AbortController()
    apiFetch(path, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then((res) => (res.ok ? res.json() : { links: [] }))
      .then((data) => setLinks(Array.isArray(data?.links) ? data.links : []))
      .catch(() => {})
    return () => controller.abort()
  }, [path, projectSlug])

  const manual = links
    .filter((l) => l.source === 'manual')
    .map((l) => l.jiraKey)
  const found = [
    ...new Set([
      ...payloadKeys,
      ...links.filter((l) => l.source !== 'manual').map((l) => l.jiraKey)
    ])
  ].sort((a, b) => a.localeCompare(b))

  const startEdit = useCallback(() => {
    setDraft(manual.join(', '))
    setError(null)
    setEditing(true)
  }, [manual])

  const save = async () => {
    const keys = parseKeys(draft)
    const problem = keyError(keys)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      const res = await checkedWrite(
        jsonWrite(path, 'PUT', { jiraKeys: keys }),
        { fallback: 'The links could not be saved' }
      )
      const data = await res.json()
      setLinks(Array.isArray(data?.links) ? data.links : [])
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Linked Jira tickets" family="speed" icon="ticket">
      <dl className="app-stat-list govuk-!-margin-bottom-4">
        <div className="app-stat-list__row">
          <dt>From the pull request</dt>
          <dd>
            <KeyList keys={found} />
          </dd>
        </div>
        <div className="app-stat-list__row">
          <dt>Added by an admin</dt>
          <dd>
            <KeyList keys={manual} />
          </dd>
        </div>
      </dl>
      {canEdit && !editing && (
        <Button
          variant="secondary"
          className="govuk-!-margin-bottom-0 app-linked-jira__action"
          onClick={startEdit}
        >
          Change links
        </Button>
      )}
      {canEdit && editing && (
        <div
          className={cx('govuk-form-group', error && 'govuk-form-group--error')}
        >
          <label className="govuk-label govuk-label--s" htmlFor={inputId}>
            Jira tickets added by an admin
          </label>
          <div id={`${inputId}-hint`} className="govuk-hint">
            Separate keys with commas, like MMO-123, MMO-124.
          </div>
          {error && (
            <ErrorMessage id={`${inputId}-error`}>{error}</ErrorMessage>
          )}
          <input
            id={inputId}
            className={cx('govuk-input', error && 'govuk-input--error')}
            type="text"
            spellCheck={false}
            aria-describedby={cx(
              `${inputId}-hint`,
              error && `${inputId}-error`
            )}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="govuk-button-group govuk-!-margin-top-3 govuk-!-margin-bottom-0">
            <Button onClick={save} disabled={saving}>
              Save links
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
