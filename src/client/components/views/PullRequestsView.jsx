import { useId, useMemo } from 'react'

import { Panel, PanelState } from '../dashboard'
import { SortableTable } from '../govuk'
import {
  formatDuration,
  selectRepoPrRows,
  selectRepoSummaries
} from '../../lib/selectors'
import { Meter, OpenButton, ScopeHeader, lines } from './scope.jsx'

const prLabel = (row) =>
  row.title ? `#${row.prNumber} ${row.title}` : `#${row.prNumber}`

/** Every pull request in the project for the selected period. */
export function PullRequestsView({ payloads, onOpenPR }) {
  const headingId = useId()
  const rows = useMemo(
    () =>
      selectRepoSummaries(payloads).flatMap((repo) =>
        selectRepoPrRows(payloads, repo.repository).map((row) => ({
          ...row,
          repository: repo.repository,
          repoName: repo.name
        }))
      ),
    [payloads]
  )

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      <ScopeHeader
        id={headingId}
        level="Browse"
        icon="merge"
        title="Pull requests"
        meta="Select a pull request to see its commits"
      />
      <Panel
        title="Pull Requests"
        family="leverage"
        icon="merge"
        className="app-compare"
      >
        {rows.length === 0 ? (
          <PanelState
            state="empty"
            emptyMessage="No pull requests fall inside the selected period."
          />
        ) : (
          <SortableTable
            className="govuk-!-margin-bottom-0"
            caption="Pull requests in the selected period"
            captionHidden
            head={[
              { id: 'repo', label: 'Repository' },
              { id: 'pr', label: 'Pull request' },
              { id: 'commits', label: 'Commits', numeric: true },
              { id: 'assist', label: 'Commit assist rate' },
              { id: 'cycle', label: 'PR coding cycle time', numeric: true },
              { id: 'net', label: 'Net lines', numeric: true }
            ]}
            rows={rows.map((r) => ({
              id: `${r.repository}#${r.prNumber}`,
              cells: [
                r.repoName,
                {
                  content: (
                    <OpenButton
                      onClick={() => onOpenPR(r.repository, r.prNumber)}
                      hint={` in ${r.repoName}`}
                    >
                      {prLabel(r)}
                    </OpenButton>
                  ),
                  sortValue: r.prNumber
                },
                r.totalCommits,
                {
                  content: (
                    <span className="app-family--assist">
                      <Meter value={r.copilotAssistedRate} />
                      {r.copilotAssistedRate}%
                    </span>
                  ),
                  sortValue: r.copilotAssistedRate
                },
                {
                  content: formatDuration(r.cycleHours),
                  sortValue: r.cycleHours
                },
                { content: lines(r.netLines), sortValue: r.netLines }
              ]
            }))}
          />
        )}
      </Panel>
    </section>
  )
}
