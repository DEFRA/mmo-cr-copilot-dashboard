import { useId, useMemo } from 'react'

import { Panel, PanelState } from '../dashboard'
import { SortableTable } from '../govuk'
import { selectContributorSummaries } from '../../lib/selectors'
import { Meter, OpenButton, ScopeHeader, lines } from './scope.jsx'

/** Every contributor in the project for the selected period. */
export function ContributorsView({
  payloads,
  onOpenContributor,
  projectType = 'ai-adopted'
}) {
  const headingId = useId()
  const isNative = projectType === 'ai-native'
  const rows = useMemo(() => {
    const summaries = selectContributorSummaries(payloads)
    // Team framing (E7-S5): AI-native lists people by name, never by rank.
    return isNative
      ? [...summaries].sort((a, b) =>
          a.contributor.localeCompare(b.contributor)
        )
      : summaries
  }, [payloads, isNative])

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      <ScopeHeader
        id={headingId}
        level="Team"
        icon="users"
        title="Contributors"
        meta={
          isNative
            ? 'For diagnosis, not comparison.'
            : 'Select a contributor to see their pull requests'
        }
      />
      <Panel
        title="Contributors"
        family="adoption"
        icon="users"
        className="app-compare"
      >
        {rows.length === 0 ? (
          <PanelState
            state="empty"
            emptyMessage="No contributors committed inside the selected period."
          />
        ) : (
          <SortableTable
            className="govuk-!-margin-bottom-0"
            caption="Contributors in the selected period"
            captionHidden
            head={[
              { id: 'who', label: 'Contributor' },
              { id: 'repos', label: 'Repositories', numeric: true },
              { id: 'prs', label: 'Pull requests', numeric: true },
              ...(isNative
                ? []
                : [{ id: 'assist', label: 'Commit assist rate' }]),
              { id: 'net', label: 'Net lines', numeric: true }
            ]}
            rows={rows.map((c) => ({
              id: c.contributor,
              cells: [
                {
                  content: (
                    <OpenButton
                      onClick={() => onOpenContributor(c.contributor)}
                    >
                      {c.contributor}
                    </OpenButton>
                  ),
                  sortValue: c.contributor
                },
                c.repoCount,
                c.prCount,
                ...(isNative
                  ? []
                  : [
                      {
                        content: (
                          <span className="app-family--assist">
                            <Meter value={c.copilotAssistedRate} />
                            {c.copilotAssistedRate}%
                          </span>
                        ),
                        sortValue: c.copilotAssistedRate
                      }
                    ]),
                { content: lines(c.netLines), sortValue: c.netLines }
              ]
            }))}
          />
        )}
      </Panel>
    </section>
  )
}
