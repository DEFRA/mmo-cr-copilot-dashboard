import { useId, useMemo } from 'react'

import { ChartFigure, KpiCard, Panel, PanelState } from '../dashboard'
import { CategoryBar } from '../charts/CategoryBar'
import { CycleTimeScatter } from '../charts/CycleTimeScatter'
import {
  formatDuration,
  selectCycleTimeStats,
  selectRepoCyclePoints,
  shortRepoName
} from '../../lib/selectors'
import { METRICS_DOC, PERIOD_CHIP, ScopeHeader, plural } from './scope.jsx'

const shortDate = (ms) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * PR coding cycle time for one repository: summary cards, every pull request
 * by merge date, and a slowest-first ranking. Each chart opens a pull request.
 */
export function RepoCycleTimeView({ payloads, repository, onOpenPR }) {
  const scopeId = useId()
  const name = shortRepoName(repository)
  const points = useMemo(
    () => selectRepoCyclePoints(payloads, repository),
    [payloads, repository]
  )
  const stats = useMemo(() => selectCycleTimeStats(points), [points])
  const ranked = useMemo(
    () => [...points].sort((a, b) => b.cycleHours - a.cycleHours),
    [points]
  )

  const header = (
    <ScopeHeader
      id={scopeId}
      level="Speed"
      icon="clock"
      title="PR coding cycle time"
      meta={`${name} · ${plural(stats.prCount, 'pull request')}`}
    />
  )

  if (points.length === 0) {
    return (
      <section className="app-scope" aria-labelledby={scopeId}>
        {header}
        <Panel title="PR coding cycle time" family="speed" icon="clock">
          <PanelState
            state="empty"
            title="PR coding cycle time"
            icon="clock"
            emptyMessage="No pull requests for this repository in the selected period."
          />
        </Panel>
      </section>
    )
  }

  const cards = [
    {
      label: 'PR coding cycle time',
      value: formatDuration(stats.avg),
      sub: `Average across ${plural(stats.measured, 'pull request')}`
    },
    {
      label: 'Median PR coding cycle time',
      value: formatDuration(stats.median),
      sub: 'Half of pull requests were faster'
    },
    {
      label: 'Fastest PR coding cycle time',
      value: formatDuration(stats.fastest),
      sub: 'Shortest first commit to last commit'
    },
    {
      label: 'Slowest PR coding cycle time',
      value: formatDuration(stats.slowest),
      sub: 'Longest first commit to last commit'
    }
  ]

  const columns = [
    { id: 'pr', label: 'Pull request' },
    { id: 'date', label: 'Merged or last commit' },
    { id: 'cycle', label: 'PR coding cycle time (hours)', numeric: true },
    { id: 'merge', label: 'Time to merge (hours)', numeric: true },
    { id: 'batch', label: 'Average batch size (lines)', numeric: true },
    { id: 'assist', label: 'Commit assist rate (%)', numeric: true },
    { id: 'who', label: 'Contributors' }
  ]
  const tableRows = (list) =>
    list.map((p) => [
      `#${p.prNumber}`,
      shortDate(p.mergedAt),
      p.cycleHours,
      p.merged ? p.timeToMergeHours : 'Not merged',
      p.batchSize,
      p.assistRate,
      p.contributors.join(', ')
    ])

  return (
    <section className="app-scope" aria-labelledby={scopeId}>
      {header}

      <div className="app-kpi-grid">
        {cards.map((card, index) => (
          <KpiCard
            key={card.label}
            {...card}
            family="speed"
            icon="clock"
            index={index}
          />
        ))}
      </div>
      <p className="govuk-body-s govuk-!-margin-top-3">
        <a
          className="govuk-link"
          href={`${METRICS_DOC}#metric-pr-coding-cycle-time`}
        >
          PR coding cycle time definition
        </a>
      </p>

      <div className="app-grid govuk-!-margin-top-5">
        <ChartFigure
          number={1}
          title="Coding Cycle Time by Merge Date"
          subtitle={`PR coding cycle time per pull request against merge date (or last commit when open), hours, ${name}, selected period. Bubble size is average batch size; colour is commit assist rate.`}
          description={`The average is ${formatDuration(stats.avg)} and the median ${formatDuration(stats.median)}. Pull request #${ranked[0].prNumber} was slowest at ${formatDuration(stats.slowest)}.`}
          family="speed"
          icon="scatter"
          chip={PERIOD_CHIP}
          className="app-span-12"
          columns={columns}
          rows={tableRows(points)}
        >
          <CycleTimeScatter
            title="PR coding cycle time by merge date"
            points={points}
            onSelect={(prNumber) => onOpenPR(repository, prNumber)}
          />
        </ChartFigure>

        <ChartFigure
          number={2}
          title="Coding Cycle Time by PR"
          subtitle={`PR coding cycle time per pull request, slowest first, hours, ${name}, selected period`}
          description={`Pull request #${ranked[0].prNumber} was slowest at ${formatDuration(stats.slowest)} and #${ranked.at(-1).prNumber} fastest.`}
          family="speed"
          icon="bars"
          chip={PERIOD_CHIP}
          className="app-span-12"
          columns={columns}
          rows={tableRows(ranked)}
        >
          <CategoryBar
            title="PR coding cycle time by pull request"
            categories={ranked.map((p) => `#${p.prNumber}`)}
            values={ranked.map((p) => p.cycleHours)}
            seriesName="PR coding cycle time"
            unit=" h"
            onSelect={(i) => onOpenPR(repository, ranked[i].prNumber)}
          />
        </ChartFigure>
      </div>
    </section>
  )
}
