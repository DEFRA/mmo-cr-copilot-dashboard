import { useId, useMemo } from 'react'

import {
  ChartFigure,
  KpiCard,
  MiniBars,
  Panel,
  PanelState,
  ProgressRing
} from '../dashboard'
import { SortableTable } from '../govuk'
import { CategoryBar } from '../charts/CategoryBar'
import { DistributionDonut } from '../charts/DistributionDonut'
import { HotspotScatter } from '../charts/HotspotScatter'
import { StackedBar } from '../charts/StackedBar'
import {
  selectContributorPRs,
  selectContributorSummaries,
  shortRepoName
} from '../../lib/selectors'
import {
  Meter,
  OpenButton,
  PERIOD_CHIP,
  PR_COLUMN,
  ScopeHeader,
  authorshipRows,
  authorshipSlices,
  lines,
  plural,
  pullRequests
} from './scope.jsx'
import { COPILOT_ASSISTED, HUMAN_AUTHORED } from '../../lib/classification.js'

const prLabel = (p) => `${p.repoName} #${p.prNumber}`

/**
 * One contributor's part in the team's delivery across every repository:
 * KPI cards, adoption and change-size figures, then their pull requests.
 */
export function ContributorView({
  payloads: allPayloads,
  contributor,
  repository,
  onOpenPR
}) {
  const scopeId = useId()
  const prsId = useId()
  const payloads = useMemo(
    () =>
      repository
        ? allPayloads.filter((p) => p.repository === repository)
        : allPayloads,
    [allPayloads, repository]
  )
  const who = repository
    ? `${contributor} in ${shortRepoName(repository)}`
    : contributor

  const summary = useMemo(
    () =>
      selectContributorSummaries(payloads).find(
        (c) => c.contributor === contributor
      ),
    [payloads, contributor]
  )
  const prs = useMemo(
    () => selectContributorPRs(payloads, contributor),
    [payloads, contributor]
  )
  const commitPoints = useMemo(
    () =>
      prs.flatMap((p) =>
        p.commits.map((c) => ({
          x: c.linesAdded,
          y: c.linesDeleted,
          size: c.linesTouched,
          category: c.classification,
          label: `${prLabel(p)} ${c.commit}`
        }))
      ),
    [prs]
  )

  if (!summary) {
    return (
      <section className="app-scope" aria-labelledby={scopeId}>
        <ScopeHeader
          id={scopeId}
          level="Drill-down"
          icon="person"
          title="Contributor overview"
          meta={who}
        />
        <Panel title="Pull requests" family="adoption" icon="person">
          <PanelState
            state="empty"
            title="Pull requests"
            icon="person"
            emptyMessage="No counted commits from this contributor in the selected period."
          />
        </Panel>
      </section>
    )
  }

  const openPr = (p) => () => onOpenPR(p.repository, p.prNumber)
  const categories = prs.map(prLabel)

  const kpis = [
    {
      label: 'Commit assist rate',
      family: 'assist',
      icon: 'sparkle',
      value: String(summary.copilotAssistedRate),
      unit: '%',
      sub: `${summary.copilotAssisted} of ${plural(summary.totalCommits, 'commit')}`,
      chart: <ProgressRing value={summary.copilotAssistedRate} />
    },
    {
      label: 'Line assist rate',
      family: 'assist',
      icon: 'code',
      value: String(summary.copilotAssistedLineRate),
      unit: '%',
      sub: `${lines(summary.copilotAssistedLines)} of ${lines(summary.linesTouched)} lines`,
      chart: <ProgressRing value={summary.copilotAssistedLineRate} />
    },
    {
      label: 'Repositories',
      family: 'leverage',
      icon: 'repo',
      value: String(summary.repoCount),
      sub: pullRequests(summary.prCount)
    },
    {
      label: 'Net lines delivered',
      family: 'output',
      icon: 'plusminus',
      value: lines(summary.netLines),
      sub: `${lines(summary.linesAdded)} added minus ${lines(summary.linesDeleted)} deleted`,
      chart: <MiniBars data={prs.map((p) => p.netLines)} />
    }
  ]

  return (
    <>
      <section className="app-scope" aria-labelledby={scopeId}>
        <ScopeHeader
          id={scopeId}
          level="Drill-down"
          icon="person"
          title="Contributor overview"
          meta={`${who} · ${plural(summary.repoCount, 'repository', 'repositories')} · ${pullRequests(summary.prCount)}`}
        />

        <div className="app-kpi-grid">
          {kpis.map((kpi, index) => (
            <KpiCard key={kpi.label} {...kpi} index={index} />
          ))}
        </div>

        <div className="app-grid govuk-!-margin-top-5">
          <ChartFigure
            number={1}
            title="Commit composition"
            subtitle={`Counted commits by classification, ${contributor}, selected period. Rebase and merge commits are excluded.`}
            description={`${summary.copilotAssisted} of ${summary.totalCommits} commits (${summary.copilotAssistedRate}%) were Copilot-assisted.`}
            family="assist"
            icon="donut"
            chip={PERIOD_CHIP}
            className="app-span-6"
            columns={[
              { id: 'class', label: 'Classification' },
              { id: 'commits', label: 'Commits', numeric: true }
            ]}
            rows={authorshipRows(
              summary.copilotAssisted,
              summary.humanAuthored
            )}
          >
            <DistributionDonut
              title="Commit composition"
              data={authorshipSlices(
                summary.copilotAssisted,
                summary.humanAuthored
              )}
            />
          </ChartFigure>
          <ChartFigure
            number={2}
            title="Line composition"
            subtitle={`Lines touched by classification, ${contributor}, selected period`}
            description={`${lines(summary.copilotAssistedLines)} of ${lines(summary.linesTouched)} lines touched (${summary.copilotAssistedLineRate}%) were in Copilot-assisted commits.`}
            family="assist"
            icon="donut"
            chip={PERIOD_CHIP}
            className="app-span-6"
            columns={[
              { id: 'class', label: 'Classification' },
              { id: 'lines', label: 'Lines touched', numeric: true }
            ]}
            rows={
              summary.linesTouched
                ? authorshipRows(
                    summary.copilotAssistedLines,
                    summary.humanAuthoredLines
                  )
                : []
            }
          >
            <DistributionDonut
              title="Line composition"
              data={authorshipSlices(
                summary.copilotAssistedLines,
                summary.humanAuthoredLines
              )}
            />
          </ChartFigure>
          <ChartFigure
            number={3}
            title="Commit assist rate by pull request"
            subtitle={`Commit assist rate per pull request for this contributor's commits, percentage, selected period`}
            description={`This contributor's commits appear in ${pullRequests(prs.length)}; ${prs.filter((p) => p.copilotAssisted > 0).length} of them include Copilot-assisted work.`}
            family="assist"
            icon="bars"
            chip={PERIOD_CHIP}
            className="app-span-6"
            columns={[
              PR_COLUMN,
              { id: 'rate', label: 'Commit assist rate (%)', numeric: true }
            ]}
            rows={prs.map((p) => [prLabel(p), p.copilotAssistedRate])}
          >
            <CategoryBar
              title="Commit assist rate by pull request"
              categories={categories}
              values={prs.map((p) => p.copilotAssistedRate)}
              seriesName="commit assist rate"
              unit="%"
              colorByValue
              onSelect={(i) => onOpenPR(prs[i].repository, prs[i].prNumber)}
            />
          </ChartFigure>
          <ChartFigure
            number={4}
            title="Commits per PR by Classification"
            subtitle={`Copilot-assisted and human-authored commits per pull request for this contributor, selected period`}
            description={`${summary.copilotAssisted} Copilot-assisted and ${summary.humanAuthored} human-authored commits across ${pullRequests(prs.length)}.`}
            family="assist"
            icon="bars"
            chip={PERIOD_CHIP}
            className="app-span-6"
            columns={[
              PR_COLUMN,
              {
                id: 'copilot',
                label: 'Copilot-assisted commits',
                numeric: true
              },
              { id: 'human', label: 'Human-authored commits', numeric: true }
            ]}
            rows={prs.map((p) => [
              prLabel(p),
              p.copilotAssisted,
              p.humanAuthored
            ])}
          >
            <StackedBar
              title="Commits by pull request and classification"
              categories={categories}
              onSelect={(i) => onOpenPR(prs[i].repository, prs[i].prNumber)}
              series={[
                {
                  name: COPILOT_ASSISTED,
                  colorToken: 'copilot',
                  data: prs.map((p) => p.copilotAssisted)
                },
                {
                  name: HUMAN_AUTHORED,
                  colorToken: 'manual',
                  data: prs.map((p) => p.humanAuthored)
                }
              ]}
            />
          </ChartFigure>
          <ChartFigure
            number={5}
            title="Lines Added and Deleted per Commit"
            subtitle={`Lines added against lines deleted per counted commit, sized by lines touched, ${contributor}, selected period. Rebase and merge commits are excluded.`}
            description={`${plural(commitPoints.length, 'counted commit')} in ${pullRequests(prs.length)}. Commits far from the origin are the largest changes.`}
            family="risk"
            icon="scatter"
            chip={PERIOD_CHIP}
            className="app-span-12"
            columns={[
              { id: 'commit', label: 'Commit' },
              { id: 'class', label: 'Classification' },
              { id: 'added', label: 'Lines added', numeric: true },
              { id: 'deleted', label: 'Lines deleted', numeric: true },
              { id: 'touched', label: 'Lines touched', numeric: true }
            ]}
            rows={commitPoints.map((c) => [
              c.label,
              c.category,
              c.x,
              c.y,
              c.size
            ])}
          >
            <HotspotScatter
              title="Lines added and deleted per commit"
              points={commitPoints}
              xName="Lines added"
              yName="Lines deleted"
            />
          </ChartFigure>
        </div>
      </section>

      <section className="app-scope" aria-labelledby={prsId}>
        <ScopeHeader
          id={prsId}
          level="Browse"
          icon="merge"
          title="Pull requests"
          meta="Select a pull request to see its commits"
        />
        <Panel
          title="Pull request history"
          family="leverage"
          icon="merge"
          aside={<span className="app-mini-tag">Newest first</span>}
          className="app-compare"
        >
          <SortableTable
            className="govuk-!-margin-bottom-0"
            caption={`Pull requests with commits from ${contributor} in the selected period, newest first`}
            captionHidden
            head={[
              PR_COLUMN,
              { id: 'repo', label: 'Repository' },
              { id: 'commits', label: 'Commits', numeric: true },
              { id: 'assist', label: 'Commit assist rate' },
              { id: 'net', label: 'Net lines delivered', numeric: true }
            ]}
            rows={prs.map((p) => ({
              id: `${p.repository}#${p.prNumber}`,
              cells: [
                {
                  content: (
                    <OpenButton onClick={openPr(p)} hint={` in ${p.repoName}`}>
                      #{p.prNumber}
                    </OpenButton>
                  ),
                  sortValue: p.prNumber
                },
                p.repoName,
                p.totalCommits,
                {
                  content: (
                    <span className="app-family--assist">
                      <Meter value={p.copilotAssistedRate} />
                      {p.copilotAssistedRate}%
                    </span>
                  ),
                  sortValue: p.copilotAssistedRate
                },
                { content: lines(p.netLines), sortValue: p.netLines }
              ]
            }))}
          />
        </Panel>
      </section>
    </>
  )
}
