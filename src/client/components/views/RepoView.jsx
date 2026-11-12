import { useId, useMemo } from 'react'

import { ChartFigure, Panel, PanelState } from '../dashboard'
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
  PERIOD_CHIP,
  PR_COLUMN,
  ScopeHeader,
  Subsection,
  authorshipRows,
  authorshipSlices,
  lines,
  plural,
  pullRequests
} from './scope.jsx'
import { repoCards } from './repo-cards.jsx'
import { RepoPrTable, prName } from './RepoPrTable.jsx'
import { COPILOT_ASSISTED, HUMAN_AUTHORED } from '../../lib/classification.js'

const DRILL_ID = 'repo-drill'
const SCOPE = 'show breakdown by pull request'

function slowestPrText(timeline, avgCycleHours) {
  if (timeline.length === 0) {
    return undefined
  }
  const slowest = timeline.reduce((max, m) =>
    m.cycleHours > max.cycleHours ? m : max
  )
  return `Pull request #${slowest.prNumber} took longest at ${formatDuration(slowest.cycleHours)}. The average is ${formatDuration(avgCycleHours)}.`
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

  const kpis = repoCards({
    summary,
    delivery,
    averages,
    prs,
    v2,
    leverage,
    onOpenLeverage,
    byPr
  })

  const prCategories = prs.map((r) => `#${r.prNumber}`)

  return (
    <>
      <section className="app-scope" aria-labelledby={repoId}>
        <ScopeHeader
          id={repoId}
          level="Drill-down"
          icon="repo"
          title="Repository overview"
          meta={`${name} · ${plural(summary.contributorCount, 'contributor')} · ${pullRequests(summary.prCount)}`}
        />

        <KpiDrillGrid kpis={kpis} drillId={DRILL_ID} actionText={SCOPE} />

        <Subsection title="Speed" family="speed" icon="clock">
          <div className="app-grid">
            <ChartFigure
              number={1}
              title="Coding Cycle Time by PR"
              subtitle={`PR coding cycle time per pull request, hours, ${name}, selected period. Merged and open pull requests are shown separately.`}
              description={slowestPrText(timeline, delivery.avgCycleHours)}
              family="speed"
              icon="clock"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                PR_COLUMN,
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
              description={`${plural(commitPoints.length, 'counted commit')} in ${pullRequests(summary.prCount)}. Commits far from the origin are the largest changes.`}
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
                PR_COLUMN,
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
                zoomAnchor="end"
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
                  ? authorshipRows(
                      summary.copilotAssistedCommits,
                      summary.humanAuthoredCommits
                    )
                  : []
              }
            >
              <DistributionDonut
                title="Commit composition"
                data={authorshipSlices(
                  summary.copilotAssistedCommits,
                  summary.humanAuthoredCommits
                )}
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
              number={6}
              title="Commit assist rate by pull request"
              subtitle={`Commit assist rate per pull request, percentage, ${name}, selected period`}
              description={`The average commit assist rate per pull request is ${averages.avgAssistRate}%. ${averages.copilotPrCount} of ${pullRequests(prs.length)} used Copilot.`}
              family="assist"
              icon="bars"
              chip={PERIOD_CHIP}
              headingLevel={4}
              className="app-span-6"
              columns={[
                PR_COLUMN,
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
              description={`${summary.copilotAssistedCommits} Copilot-assisted and ${summary.humanAuthoredCommits} human-authored commits across ${pullRequests(prs.length)}.`}
              family="assist"
              icon="bars"
              chip={PERIOD_CHIP}
              headingLevel={4}
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
                    name: COPILOT_ASSISTED,
                    colorToken: 'copilot',
                    data: prs.map((r) => r.copilotAssistedCommits)
                  },
                  {
                    name: HUMAN_AUTHORED,
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
          <RepoPrTable
            prs={prs}
            name={name}
            jiraConnected={jiraConnected}
            onOpen={openPr}
          />
        </Panel>
      </section>
    </>
  )
}
