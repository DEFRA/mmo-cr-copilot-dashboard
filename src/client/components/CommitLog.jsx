import { useState } from 'react'
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

/**
 * The commit log for one pull request.
 *
 * Once a PR is merged its commit list is final, so an operator may correct a
 * misclassified commit here. While the PR is still open the column stays
 * read-only: the analytics producer re-runs on every push and would overwrite
 * the correction. Every accepted change is recorded in the audit trail shown
 * on the Settings page.
 */
export function CommitLog({
  repository,
  prNumber,
  commits,
  editable = false,
  onChangeClassification
}) {
  const [pendingCommit, setPendingCommit] = useState(null)
  const [error, setError] = useState(null)

  const change = async (commit, classification) => {
    setPendingCommit(commit)
    setError(null)
    try {
      await onChangeClassification({
        repository,
        prNumber,
        commit,
        classification
      })
    } catch (err) {
      setError(err.message || 'Failed to update the classification.')
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
          {error}
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
              <th scope="col" className="px-3 py-2 font-medium">
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

              return (
                <tr
                  key={c.commit}
                  className="border-t border-[var(--color-border)]"
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
                    {editable ? (
                      <select
                        className="filter-input"
                        aria-label={`Classification for commit ${c.commit}`}
                        value={c.classification}
                        disabled={pendingCommit === c.commit}
                        onChange={(e) => change(c.commit, e.target.value)}
                      >
                        {COMMIT_CLASSIFICATIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="pill"
                        style={{ color: pillColor, borderColor: pillColor }}
                      >
                        <span aria-hidden="true">{pill.icon}</span>
                        {pill.label}
                      </span>
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
