import { useEffect, useRef, useState } from 'react'
import { Panel } from './Panel'
import { COMMIT_CLASSIFICATIONS } from '../lib/classification'
import { effectiveClassification, shortRepoName } from '../lib/selectors'

const PILL = {
  'Copilot-assisted': { icon: '✦', label: 'Copilot', color: 'copilot' },
  'Human-authored': { icon: '✎', label: 'Human-authored', color: 'manual' },
  Rebase: { icon: '⮑', label: 'Rebase', color: 'text-muted' },
  Dependabot: { icon: '⬢', label: 'Dependabot', color: 'text-muted' }
}

function pillFor(classification) {
  return PILL[classification] ?? PILL['Human-authored']
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.1 2.2a1.7 1.7 0 0 1 2.4 2.4L5.3 12.8l-3.1.7.7-3.1z" />
    </svg>
  )
}

const SAVE_FAILED = 'Failed to update the classification.'

/**
 * The commit log for one pull request.
 *
 * Once a PR is merged its commit list is final, so an operator may correct a
 * misclassified commit here. While the PR is still open the column stays
 * read-only: the analytics producer re-runs on every push and would overwrite
 * the correction. Every accepted change is recorded in the audit trail shown
 * on the Settings page.
 *
 * Correction is an explicit inline edit — pill plus pencil, then a select with
 * confirm and cancel — rather than a save-on-change select, because every
 * accepted change writes an audit entry and a stray selection must not.
 */
export function CommitLog({
  repository,
  prNumber,
  commits,
  editable = false,
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

  return (
    <Panel
      title="Commit Log"
      subtitle={
        editable
          ? `${shortRepoName(repository)} · PR #${prNumber} · classifications can be corrected — every change is audited`
          : `${shortRepoName(repository)} · PR #${prNumber} · classifications become editable once the PR is merged`
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-3 text-xs font-medium text-[var(--color-danger)]"
        >
          {error.message}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th scope="col" className="px-3 py-2 font-medium">
                Commit
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Author
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Subject
              </th>
              <th
                scope="col"
                className={`px-3 py-2 font-medium${editable ? ' commit-class-col' : ''}`}
              >
                Class
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                +Added
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                −Deleted
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {commits.map((c) => {
              const kind = effectiveClassification(c)
              const pill = pillFor(kind)
              const pillColor = `var(--color-${pill.color})`
              const isEditing = editingCommit === c.commit
              const isPending = pendingCommit === c.commit
              const rowError = error?.commit === c.commit ? error.message : null
              const errorId = `commit-class-error-${c.commit}`

              return (
                <tr
                  key={c.commit}
                  aria-busy={isPending || undefined}
                  className="commit-row border-t border-[var(--color-border)]"
                >
                  <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                    {c.commit}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text)]">
                    {c.author ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text)]">
                    {c.subject}
                  </td>
                  <td className="px-3 py-2">
                    <div className="commit-class-cell">
                      {isEditing ? (
                        <>
                          <select
                            ref={selectRef}
                            className="filter-input filter-input--inline"
                            aria-label={`Classification for commit ${c.commit}`}
                            aria-invalid={rowError ? 'true' : undefined}
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
                          <button
                            type="button"
                            className="icon-button icon-button--confirm focus-ring"
                            aria-label={`Save classification for commit ${c.commit}`}
                            disabled={isPending}
                            onClick={() =>
                              confirmEdit(c.commit, c.classification)
                            }
                          >
                            {isPending ? (
                              <span
                                className="icon-button__spinner"
                                aria-hidden="true"
                              />
                            ) : (
                              <span aria-hidden="true">✓</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button--cancel focus-ring"
                            aria-label={`Cancel editing classification for commit ${c.commit}`}
                            disabled={isPending}
                            onClick={() => closeEdit(c.commit)}
                          >
                            <span aria-hidden="true">✕</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className="pill"
                            style={{ color: pillColor, borderColor: pillColor }}
                          >
                            <span aria-hidden="true">{pill.icon}</span>
                            {pill.label}
                          </span>
                          {editable && (
                            <button
                              type="button"
                              ref={(el) => {
                                if (el) editButtons.current.set(c.commit, el)
                                else editButtons.current.delete(c.commit)
                              }}
                              className="icon-button icon-button--ghost focus-ring"
                              aria-label={`Edit classification for commit ${c.commit}`}
                              onClick={() =>
                                startEdit(c.commit, c.classification)
                              }
                            >
                              <PencilIcon />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {rowError && (
                      <p id={errorId} className="commit-class-error">
                        <span aria-hidden="true">⚠</span>
                        {rowError}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-success)]">
                    +{c.linesAdded}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-danger)]">
                    −{c.linesDeleted}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text)]">
                    {c.netLines}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
