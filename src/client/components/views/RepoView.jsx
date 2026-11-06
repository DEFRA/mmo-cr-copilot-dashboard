import { useId, useMemo } from 'react'

import {
  ChartFigure,
  MiniBars,
  Panel,
  PanelState,
  ProgressRing
} from '../dashboard'
import { SortableTable, Tag } from '../govuk'
import { useLeverageV2 } from '../../hooks/useProjectMetric'
import { CategoryBar } from '../charts/CategoryBar'
import { DeliveryTimeBar } from '../charts/DeliveryTimeBar'
import { DistributionDonut } from '../charts/DistributionDonut'
import { HotspotScatter } from '../charts/HotspotScatter'
import { SonarQualityGatePanel } from '../charts/SonarQuality'
import { StackedBar } from '../charts/StackedBar'
import {
  formatDuration,
  selectCommitHotspots,
  selectCopilotLeverage,
  selectDeliveryMetrics,
  selectDeliverySummary,
  selectPrAverages,
  selectRepoContributors,
  selectRepoPRs,
  selectRepoPrRows,
  selectRepoSummaries,
  shortRepoName
} from '../../lib/selectors'
import {
  KpiDrillGrid,
  Meter,
  OpenButton,
  PERIOD_CHIP,
  ScopeHeader,
  Subsection,
  lines,
  plural
} from './scope.jsx'

const DRILL_ID = 'repo-drill'
const SCOPE = 'show breakdown by pull request'

const prName = (row) =>
  row.title ? `#${row.prNumber} ${row.title}` : `#${row.prNumber}`

function PrStatusTag({ merged }) {
  return merged ? (
    <Tag colour="green">Merged</Tag>
  ) : (
    <Tag colour="blue">Open</Tag>
  )
}

function JiraKeys({ keys }) {
  if (keys.length === 0) {
    return <span className="app-badge app-badge--excluded">No Jira key</span>
  }
  return keys.map((key) => (
    <span key={key} className="app-badge app-badge--ticket">
      {key}
    </span>
  ))
}

/**
 * Repository overview: the same KPI cards as the project with a by-pull-request
 * drill panel, speed, adoption and quality subsections, then the pull request
 * list one scope down (docs/design-system.md §8.4).
 */
export function RepoView({
  payloads,
  allPayloads,
  repository,
  projectSlug,
  jiraConnected = false,
  window,
  onOpenPR,
  onOpenContributor,
  onOpenLeverage,
  leverageData,
  sonarAsOf
}) {
  const repoLeverage = useLeverageV2(projectSlug, window, repository)
  const v2 = leverageData ?? repoLeverage.data
  const repoId = useId()
  const prsId = useId()
  const name = shortRepoName(repository)
  const history = allPayloads ?? payloads

  const repoPayloads = useMemo(
    () => selectRepoPRs(payloads, repository),
    [payloads, repository]
  )
  const summary = useMemo(
    () => selectRepoSummaries(repoPayloads)[0],
    [repoPayloads]
  )
  const delivery = useMemo(
    () => selectDeliverySummary(repoPayloads, history),
    [repoPayloads, history]
  )
  const leverage = useMemo(
    () => selectCopilotLeverage(repoPayloads, history).repos[0],
    [repoPayloads, history]
  )
  const prs = useMemo(
    () => selectRepoPrRows(payloads, repository),
    [payloads, repository]
  )
  const averages = useMemo(() => selectPrAverages(prs), [prs])
  const contributors = useMemo(
    () => selectRepoContributors(payloads, repository),
    [payloads, repository]
  )
  const timeline = useMemo(
    () => selectDeliveryMetrics(repoPayloads),
    [repoPayloads]
  )
  const commitPoints = useMemo(
    () => selectCommitHotspots(repoPayloads),
    [repoPayloads]
  )

  if (!summary) {
    return (
      <section className="app-scope" aria-labelledby={repoId}>
        <ScopeHeader
          id={repoId}
          level="Drill-down"
          icon="repo"
          title="Repository overview"
          meta={name}
        />
        <Panel title="Pull requests" family="leverage" icon="merge">
          <PanelState
            state="empty"
            title="Pull requests"
            icon="repo"
            emptyMessage="No pull requests for this repository in the selected period."
          />
        </Panel>
      </section>
    )
  }

  const openPr = (prNumber) => () => onOpenPR(repository, prNumber)
  const byPr = (toItem) =>
    prs.map((r) => ({
      key: r.prNumber,
      name: prName(r),
      onOpen: openPr(r.prNumber),
      ...toItem(r)
    }))

  const kpis = [
    {
      id: 'adoption',
      label: 'Copilot adoption',
      anchor: 'metric-copilot-adoption',
      family: 'adoption',
      icon: 'users',
      value: String(delivery.adoptionPct),
      unit: '%',
      sub: `${delivery.adopters} of ${delivery.contributorTotal} contributors`,
      chart: <ProgressRing value={delivery.adoptionPct} />,
      drill: {
        title: 'Copilot adoption by pull request',
        items: byPr((r) => ({
          value: `${r.adopters} of ${plural(r.contributors.length, 'contributor')}`,
          sub: r.contributors.join(', ')
        }))
      }
    },
    {
      id: 'assist',
      label: 'Commit assist rate',
      anchor: 'metric-copilot-assist-rate',
      family: 'assist',
      icon: 'sparkle',
      value: String(summary.copilotAssistedRate),
      unit: '%',
      sub: `${summary.copilotAssistedCommits} of ${summary.totalCommits} commits · Copilot used in ${averages.copilotPrCount} of ${plural(summary.prCount, 'pull request')} · average ${averages.avgAssistRate}% per pull request`,
      chart: <ProgressRing value={summary.copilotAssistedRate} />,
      drill: {
        title: 'Commit assist rate by pull request',
        items: byPr((r) => ({
          value: `${r.copilotAssistedRate}%`,
          sub: `${r.copilotAssistedCommits} of ${plural(r.totalCommits, 'commit')}`,
          pct: r.copilotAssistedRate
        }))
      }
    },
    {
      id: 'linerate',
      label: 'Line assist rate',
      anchor: 'metric-copilot-line-rate',
      family: 'assist',
      icon: 'code',
      value: String(summary.copilotAssistedLineRate),
      unit: '%',
      sub: `${lines(summary.copilotAssistedLines)} of ${lines(summary.totalLinesTouched)} lines`,
      chart: <ProgressRing value={summary.copilotAssistedLineRate} />,
      drill: {
        title: 'Line assist rate by pull request',
        items: byPr((r) => ({
          value: `${r.copilotAssistedLineRate}%`,
          sub: `${lines(r.copilotAssistedLines)} Copilot and ${lines(r.humanAuthoredLines)} human-authored of ${lines(r.totalLinesTouched)} lines`,
          pct: r.copilotAssistedLineRate
        }))
      }
    },
    {
      id: 'leverage',
      label: 'Copilot Leverage',
      anchor: 'metric-copilot-leverage',
      family: 'leverage',
      icon: 'rocket',
      ...(v2
        ? {
            value: v2.enoughData ? String(v2.overallLeverageScore) : '–',
            unit: v2.enoughData ? '×' : undefined,
            sub: v2.enoughData
              ? `${v2.comparableBands} comparable ${v2.comparableBands === 1 ? 'band' : 'bands'} · ${v2.sampleSize.adopted} adopted PRs`
              : 'Not enough comparable pull requests yet'
          }
        : {
            value: String(leverage.leveragePct),
            unit: '%',
            sub: leverage.flowAvailable
              ? `Coverage ${leverage.coverage}% · adoption ${leverage.adoption}% · ${leverage.flowRatio}× faster than baseline`
              : `Coverage ${leverage.coverage}% · adoption ${leverage.adoption}% · no speed baseline yet`
          }),
      chart: v2 ? undefined : <ProgressRing value={leverage.leveragePct} />,
      drill: {
        title: 'Copilot Leverage inputs by pull request',
        ...(onOpenLeverage && {
          more: { text: 'How this is calculated', onOpen: onOpenLeverage }
        }),
        intro: `Copilot Leverage is scored per repository. Each pull request is Copilot-led at a commit assist rate of 50% or more. Read with PR rework ratio: ${delivery.reworkRatio}.`,
        items: byPr((r) => ({
          value: r.copilotLed ? 'Copilot-led' : 'Human-led',
          sub: `Line assist ${r.copilotAssistedLineRate}% · PR coding cycle time ${formatDuration(r.cycleHours)}`
        }))
      }
    },
    {
      id: 'cycletime',
      label: 'PR coding cycle time',
      anchor: 'metric-pr-coding-cycle-time',
      family: 'speed',
      icon: 'clock',
      value: formatDuration(delivery.avgCycleHours),
      sub: `Average · median ${formatDuration(delivery.medianCycleHours)} · fastest ${formatDuration(delivery.fastestCycleHours)}`,
      chart: <MiniBars data={prs.map((r) => r.cycleHours)} />,
      drill: {
        title: 'PR coding cycle time by pull request',
        items: byPr((r) => ({
          value: formatDuration(r.cycleHours),
          sub: r.merged ? 'Merged' : 'Open'
        }))
      }
    },
    {
      id: 'rework',
      label: 'PR rework ratio',
      anchor: 'metric-pr-rework-ratio',
      family: 'risk',
      icon: 'rework',
      value: String(delivery.reworkRatio),
      sub: `${lines(delivery.linesDeleted)} deleted per ${lines(delivery.linesAdded)} added`,
      chart: <MiniBars data={prs.map((r) => r.reworkRatio)} />,
      drill: {
        title: 'PR rework ratio by pull request',
        items: byPr((r) => ({
          value: String(r.reworkRatio),
          sub: `${lines(r.linesDeleted)} deleted per ${lines(r.linesAdded)} added`
        }))
      }
    },
    {
      id: 'batch',
      label: 'Average batch size',
      anchor: 'metric-avg-batch-size',
      family: 'speed',
      icon: 'box',
      value: String(delivery.avgCommitSize),
      unit: 'lines',
      sub: 'Lines touched per commit',
      chart: <MiniBars data={prs.map((r) => r.avgCommitSize)} />,
      drill: {
        title: 'Average batch size by pull request',
        items: byPr((r) => ({
          value: `${r.avgCommitSize} lines`,
          sub: `${lines(r.totalLinesTouched)} lines over ${plural(r.totalCommits, 'commit')}`
        }))
      }
    },
    {
      id: 'netlines',
      label: 'Net lines delivered',
      anchor: 'metric-net-lines-delivered',
      family: 'output',
      icon: 'plusminus',
      value: lines(delivery.netLines),
      compact: true,
      sub: `${lines(delivery.linesAdded)} added minus ${lines(delivery.linesDeleted)} deleted`,
      chart: <MiniBars data={prs.map((r) => r.netLines)} />,
      drill: {
        title: 'Net lines delivered by pull request',
        items: byPr((r) => ({
          value: lines(r.netLines),
          sub: `${lines(r.linesAdded)} added minus ${lines(r.linesDeleted)} deleted`
        }))
      }
    }
  ]

  const prCategories = prs.map((r) => `#${r.prNumber}`)
  const slowest = timeline.reduce(
    (max, m) => (m.cycleHours > (max?.cycleHours ?? -1) ? m : max),
    null
  )

  return (
    <>
      <section className="app-scope" aria-labelledby={repoId}>
        <ScopeHeader
          id={repoId}
          level="Drill-down"
          icon="repo"
          title="Repository overview"
          meta={`${name} · ${plural(summary.contributorCount, 'contributor')} · ${plural(summary.prCount, 'pull request')}`}
        />

        <KpiDrillGrid kpis={kpis} drillId={DRILL_ID} actionText={SCOPE} />

        <Subsection title="Speed" family="speed" icon="clock">
          <div className="app-grid">
            <ChartFigure
              number={1}
              title="Coding Cycle Time by PR"
              subtitle={`PR coding cycle time per pull request, hours, ${name}, selected period. Merged and open pull requests are shown separately.`}
              description={
                slowest
                  ? `Pull request #${slowest.prNumber} took longest at ${formatDuration(slowest.cycleHours)}. The average is ${formatDuration(delivery.avgCycleHours)}.`
                  : undefined
              }
              family="speed"
              icon="clock"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                { id: 'pr', label: 'Pull request' },
                {
                  id: 'cycle',
                  label: 'PR coding cycle time (hours)',
                  numeric: true
                },
                { id: 'status', label: 'Status' }
              ]}
              rows={timeline.map((m) => [
                `#${m.prNumber}`,
                m.cycleHours,
                m.completed ? 'Merged' : 'Open'
              ])}
            >
              <DeliveryTimeBar
                title="PR coding cycle time by pull request"
                items={timeline}
                onSelect={(i) => onOpenPR(repository, timeline[i].prNumber)}
              />
            </ChartFigure>
            <ChartFigure
              number={2}
              title="Lines Added and Deleted per Commit"
              subtitle={`Lines added against lines deleted per counted commit, sized by lines touched, ${name}, selected period. Rebase and merge commits are excluded.`}
              description={`${plural(commitPoints.length, 'counted commit')} in ${plural(summary.prCount, 'pull request')}. Commits far from the origin are the largest changes.`}
              family="risk"
              icon="scatter"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
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
            <ChartFigure
              number={3}
              title="Batch Size by PR"
              subtitle={`Average lines touched per commit per pull request, ${name}, selected period`}
              description={`The repository average is ${delivery.avgCommitSize} lines per commit. Smaller batches are easier to review.`}
              family="speed"
              icon="box"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-12"
              columns={[
                { id: 'pr', label: 'Pull request' },
                {
                  id: 'size',
                  label: 'Average batch size (lines)',
                  numeric: true
                }
              ]}
              rows={timeline.map((m) => [`#${m.prNumber}`, m.avgCommitSize])}
            >
              <CategoryBar
                title="Average batch size by pull request"
                categories={timeline.map((m) => `#${m.prNumber}`)}
                values={timeline.map((m) => m.avgCommitSize)}
                seriesName="average batch size"
                unit=" lines"
                onSelect={(i) => onOpenPR(repository, timeline[i].prNumber)}
              />
            </ChartFigure>
          </div>
        </Subsection>

        <Subsection title="Adoption" family="assist" icon="sparkle">
          <div className="app-grid">
            <ChartFigure
              number={4}
              title="Commit composition"
              subtitle={`Counted commits by classification, ${name}, selected period`}
              description={`${summary.copilotAssistedCommits} of ${summary.totalCommits} commits (${summary.copilotAssistedRate}%) were Copilot-assisted. Rebase and merge commits are excluded.`}
              family="assist"
              icon="donut"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                { id: 'class', label: 'Classification' },
                { id: 'commits', label: 'Commits', numeric: true }
              ]}
              rows={
                summary.totalCommits
                  ? [
                      ['Copilot-assisted', summary.copilotAssistedCommits],
                      ['Human-authored', summary.humanAuthoredCommits]
                    ]
                  : []
              }
            >
              <DistributionDonut
                title="Commit composition"
                data={[
                  {
                    name: 'Copilot-assisted',
                    value: summary.copilotAssistedCommits
                  },
                  {
                    name: 'Human-authored',
                    value: summary.humanAuthoredCommits
                  }
                ]}
              />
            </ChartFigure>
            <ChartFigure
              number={5}
              title="Line composition"
              subtitle={`Lines touched by classification, ${name}, selected period`}
              description={`${lines(summary.copilotAssistedLines)} of ${lines(summary.totalLinesTouched)} lines touched (${summary.copilotAssistedLineRate}%) were in Copilot-assisted commits.`}
              family="assist"
              icon="donut"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                { id: 'class', label: 'Classification' },
                { id: 'lines', label: 'Lines touched', numeric: true }
              ]}
              rows={
                summary.totalLinesTouched
                  ? [
                      ['Copilot-assisted', summary.copilotAssistedLines],
                      ['Human-authored', summary.humanAuthoredLines]
                    ]
                  : []
              }
            >
              <DistributionDonut
                title="Line composition"
                data={[
                  {
                    name: 'Copilot-assisted',
                    value: summary.copilotAssistedLines
                  },
                  { name: 'Human-authored', value: summary.humanAuthoredLines }
                ]}
              />
            </ChartFigure>
            <ChartFigure
              number={6}
              title="Commit assist rate by pull request"
              subtitle={`Commit assist rate per pull request, percentage, ${name}, selected period`}
              description={`The average commit assist rate per pull request is ${averages.avgAssistRate}%. ${averages.copilotPrCount} of ${plural(prs.length, 'pull request')} used Copilot.`}
              family="assist"
              icon="bars"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                { id: 'pr', label: 'Pull request' },
                { id: 'rate', label: 'Commit assist rate (%)', numeric: true }
              ]}
              rows={prs.map((r) => [`#${r.prNumber}`, r.copilotAssistedRate])}
            >
              <CategoryBar
                title="Commit assist rate by pull request"
                categories={prCategories}
                values={prs.map((r) => r.copilotAssistedRate)}
                seriesName="commit assist rate"
                unit="%"
                colorByValue
                onSelect={(i) => onOpenPR(repository, prs[i].prNumber)}
              />
            </ChartFigure>
            <ChartFigure
              number={7}
              title="Commits per PR by Classification"
              subtitle={`Copilot-assisted and human-authored commits per pull request, ${name}, selected period`}
              description={`${summary.copilotAssistedCommits} Copilot-assisted and ${summary.humanAuthoredCommits} human-authored commits across ${plural(prs.length, 'pull request')}.`}
              family="assist"
              icon="bars"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                { id: 'pr', label: 'Pull request' },
                {
                  id: 'copilot',
                  label: 'Copilot-assisted commits',
                  numeric: true
                },
                { id: 'human', label: 'Human-authored commits', numeric: true }
              ]}
              rows={prs.map((r) => [
                `#${r.prNumber}`,
                r.copilotAssistedCommits,
                r.humanAuthoredCommits
              ])}
            >
              <StackedBar
                title="Commits by pull request and classification"
                categories={prCategories}
                onSelect={(i) => onOpenPR(repository, prs[i].prNumber)}
                series={[
                  {
                    name: 'Copilot-assisted',
                    colorToken: 'copilot',
                    data: prs.map((r) => r.copilotAssistedCommits)
                  },
                  {
                    name: 'Human-authored',
                    colorToken: 'manual',
                    data: prs.map((r) => r.humanAuthoredCommits)
                  }
                ]}
              />
            </ChartFigure>
            <ChartFigure
              number={8}
              title="Commit assist rate by contributor"
              subtitle={`Commit assist rate by contributor, percentage, ${name}, selected period`}
              description={
                contributors.length
                  ? `${contributors[0].contributor} has the highest commit assist rate at ${contributors[0].rate}%; ${contributors.at(-1).contributor} the lowest at ${contributors.at(-1).rate}%.`
                  : undefined
              }
              family="adoption"
              icon="users"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-12"
              columns={[
                { id: 'who', label: 'Contributor' },
                { id: 'rate', label: 'Commit assist rate (%)', numeric: true },
                { id: 'commits', label: 'Copilot commits' }
              ]}
              rows={contributors.map((c) => [
                c.contributor,
                c.rate,
                `${c.assisted} of ${c.total}`
              ])}
            >
              <CategoryBar
                title="Commit assist rate by contributor"
                categories={contributors.map((c) => c.contributor)}
                values={contributors.map((c) => c.rate)}
                seriesName="commit assist rate"
                unit="%"
                colorByValue
                onSelect={(i) =>
                  onOpenContributor(contributors[i].contributor, repository)
                }
              />
            </ChartFigure>
          </div>
        </Subsection>

        <Subsection
          title="Code quality"
          family="quality"
          icon="shield"
          meta="SonarCloud, main branch"
        >
          <SonarQualityGatePanel repository={repository} asOf={sonarAsOf} />
        </Subsection>
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
          title={<>Pull Requests in {name}</>}
          family="leverage"
          icon="merge"
          aside={<span className="app-mini-tag">Newest first</span>}
          className="app-compare"
        >
          <SortableTable
            className="govuk-!-margin-bottom-0"
            caption={`Pull requests in ${name} for the selected period, newest first`}
            captionHidden
            head={[
              { id: 'pr', label: 'Pull request' },
              { id: 'who', label: 'Contributors' },
              { id: 'status', label: 'Status' },
              { id: 'assist', label: 'Commit assist rate' },
              { id: 'cycle', label: 'PR coding cycle time', numeric: true },
              ...(jiraConnected
                ? [{ id: 'jira', label: 'Jira', sortable: false }]
                : [])
            ]}
            rows={prs.map((r) => ({
              id: r.prNumber,
              cells: [
                {
                  content: (
                    <OpenButton onClick={openPr(r.prNumber)}>
                      {prName(r)}
                    </OpenButton>
                  ),
                  sortValue: r.prNumber
                },
                r.contributors.join(', '),
                {
                  content: <PrStatusTag merged={r.merged} />,
                  sortValue: r.merged ? 'Merged' : 'Open'
                },
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
                ...(jiraConnected
                  ? [<JiraKeys key="jira" keys={r.jiraKeys} />]
                  : [])
              ]
            }))}
          />
        </Panel>
      </section>
    </>
  )
}
