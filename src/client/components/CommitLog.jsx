import { useEffect, useRef, useState } from 'react'

import { ClassificationBadge, Panel } from './dashboard'
import { COMMIT_CLASSIFICATIONS } from '../lib/classification'
import { effectiveClassification } from '../lib/selectors'

const SAVE_FAILED = 'Failed to update the classification.'

const formatCommitted = (iso) => {
  const time = Date.parse(iso)
  return Number.isNaN(time)
    ? '—'
    : new Date(time).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
}

function CommitBadge({ classification }) {
  if (classification === 'Rebase' || classification === 'Dependabot') {
    return (
      <span className="app-badge app-badge--excluded">
        Excluded: {classification === 'Rebase' ? 'rebase' : 'Dependabot'}
      </span>
    )
  }
  return <ClassificationBadge classification={classification} long />
}

function logStatus(canReclassify, editable) {
  if (!canReclassify) return null
  return editable
    ? 'Merged: classification can be corrected, every change is audited'
    : 'Open: classification can be corrected once merged'
}

/**
 * The commit log for one pull request (docs/design-system.md §8.10).
 *
 * Correction is admin-only and waits for the merge, because the producer
 * re-runs on every push and would overwrite it. It is an explicit edit with
 * save and cancel, as every accepted change writes an audit entry.
 */
export function CommitLog({
  repository,
  prNumber,
  commits,
  editable = false,
  canReclassify = false,
  onChangeClassification
}) {
  const [editingCommit, setEditingCommit] = useState(null)
  const [draft, setDraft] = useState(null)
  const [pendingCommit, setPendingCommit] = useState(null)
  const [error, setError] = useState(null)

  const selectRef = useRef(null)
  const editButtons = useRef(new Map())
  const returnFocusTo = useRef(null)

  useEffect(() => {
    if (editingCommit) {
      selectRef.current?.focus()
      return
    }

    const commit = returnFocusTo.current
    if (!commit) return
    returnFocusTo.current = null
    editButtons.current.get(commit)?.focus()
  }, [editingCommit])

  // Opening another row replaces the open one, so only ever one draft exists.
  const startEdit = (commit, classification) => {
    returnFocusTo.current = null
    setEditingCommit(commit)
    setDraft(classification)
    setError(null)
  }

  const closeEdit = (commit) => {
    returnFocusTo.current = commit
    setEditingCommit(null)
    setDraft(null)
    setError(null)
  }

  const confirmEdit = async (commit, classification) => {
    if (draft === classification) {
      closeEdit(commit)
      return
    }

    setPendingCommit(commit)
    setError(null)
    try {
      await onChangeClassification({
        repository,
        prNumber,
        commit,
        classification: draft
      })
      closeEdit(commit)
    } catch (err) {
      setError({ commit, message: err.message || SAVE_FAILED })
    } finally {
      setPendingCommit(null)
    }
  }

  const renderCorrection = (c) => {
    if (!editable) return <span className="app-muted">Once merged</span>

    if (editingCommit !== c.commit) {
      return (
        <button
          type="button"
          ref={(el) => {
            if (el) editButtons.current.set(c.commit, el)
            else editButtons.current.delete(c.commit)
          }}
          className="app-link-button"
          onClick={() => startEdit(c.commit, c.classification)}
        >
          Edit{' '}
          <span className="govuk-visually-hidden">
            classification for commit {c.commit}
          </span>
        </button>
      )
    }

    const isPending = pendingCommit === c.commit
    const rowError = error?.commit === c.commit ? error.message : null
    const selectId = `commit-class-${c.commit}`
    const errorId = `${selectId}-error`

    return (
      <div
        className={`govuk-form-group govuk-!-margin-bottom-0${rowError ? ' govuk-form-group--error' : ''}`}
      >
        <label className="govuk-label govuk-visually-hidden" htmlFor={selectId}>
          Classification for commit {c.commit}
        </label>
        {rowError && (
          <p id={errorId} className="govuk-error-message" role="alert">
            <span className="govuk-visually-hidden">Error:</span> {rowError}
          </p>
        )}
        <select
          ref={selectRef}
          id={selectId}
          className={`govuk-select${rowError ? ' govuk-select--error' : ''}`}
          aria-describedby={rowError ? errorId : undefined}
          value={draft}
          disabled={isPending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeEdit(c.commit)
            if (e.key === 'Enter') {
              e.preventDefault()
              confirmEdit(c.commit, c.classification)
            }
          }}
        >
          {COMMIT_CLASSIFICATIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="govuk-button-group govuk-!-margin-top-2 govuk-!-margin-bottom-0">
          <button
            type="button"
            className="govuk-button govuk-!-margin-bottom-0"
            disabled={isPending}
            aria-disabled={isPending || undefined}
            onClick={() => confirmEdit(c.commit, c.classification)}
          >
            Save{' '}
            <span className="govuk-visually-hidden">
              classification for commit {c.commit}
            </span>
          </button>
          <button
            type="button"
            className="govuk-button govuk-button--secondary govuk-!-margin-bottom-0"
            disabled={isPending}
            aria-disabled={isPending || undefined}
            onClick={() => closeEdit(c.commit)}
          >
            Cancel{' '}
            <span className="govuk-visually-hidden">
              editing classification for commit {c.commit}
            </span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <Panel
      title="Commit log"
      family="leverage"
      icon="code"
      aside={
        canReclassify && (
          <span className="app-mini-tag">
            {logStatus(canReclassify, editable)}
          </span>
        )
      }
      className="app-compare"
    >
      <table className="govuk-table govuk-!-margin-bottom-0">
        <caption className="govuk-table__caption govuk-visually-hidden">
          Commits in pull request {prNumber}
        </caption>
        <thead className="govuk-table__head">
          <tr className="govuk-table__row">
            <th scope="col" className="govuk-table__header">
              Commit
            </th>
            <th scope="col" className="govuk-table__header">
              Subject
            </th>
            <th scope="col" className="govuk-table__header">
              Author
            </th>
            <th scope="col" className="govuk-table__header">
              Committed
            </th>
            <th
              scope="col"
              className="govuk-table__header govuk-table__header--numeric"
            >
              Added
            </th>
            <th
              scope="col"
              className="govuk-table__header govuk-table__header--numeric"
            >
              Deleted
            </th>
            <th
              scope="col"
              className="govuk-table__header govuk-table__header--numeric"
            >
              Net
            </th>
            <th scope="col" className="govuk-table__header">
              Classification
            </th>
            {canReclassify && (
              <th scope="col" className="govuk-table__header">
                <span className="govuk-visually-hidden">
                  Classification actions
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="govuk-table__body">
          {commits.map((c) => (
            <tr
              key={c.commit}
              className="govuk-table__row"
              aria-busy={pendingCommit === c.commit || undefined}
            >
              <th scope="row" className="govuk-table__header">
                <code>{c.commit}</code>
              </th>
              <td className="govuk-table__cell">{c.subject}</td>
              <td className="govuk-table__cell">{c.author ?? '—'}</td>
              <td className="govuk-table__cell">
                {formatCommitted(c.committedAt)}
              </td>
              <td className="govuk-table__cell govuk-table__cell--numeric">
                +{c.linesAdded}
              </td>
              <td className="govuk-table__cell govuk-table__cell--numeric">
                −{c.linesDeleted}
              </td>
              <td className="govuk-table__cell govuk-table__cell--numeric">
                {c.netLines}
              </td>
              <td className="govuk-table__cell">
                <CommitBadge classification={effectiveClassification(c)} />
              </td>
              {canReclassify && (
                <td className="govuk-table__cell">{renderCorrection(c)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
