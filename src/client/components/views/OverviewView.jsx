import { useId, useMemo } from 'react'

import {
  ChartFigure,
  LiveStreamControls,
  Panel,
  PanelState,
  PeriodChip,
  useLiveStreamPaused
} from '../dashboard'
import { Table } from '../govuk'
import { CopilotUsagePanel } from '../CopilotUsagePanel'
import { ActivityHeatmap } from '../charts/ActivityHeatmap'
import { CategoryBar } from '../charts/CategoryBar'
import { DistributionDonut } from '../charts/DistributionDonut'
import { LiveCommitStream } from '../charts/LiveCommitStream'
import { ProfileRadar } from '../charts/ProfileRadar'
import { SonarPortfolioPanel, SonarSprintTrend } from '../charts/SonarQuality'
import { PERSONAS } from '../../lib/personas'
import {
  formatDuration,
  selectCommitTimeline,
  selectContributorRepoMatrix,
  selectContributorSummaries,
  selectCopilotLeverage,
  selectCopilotUsage,
  selectDeliverySummary,
  selectGlobalSummary,
  selectPersonaSummaries,
  selectRepoCycleTimes,
  selectRepoProfiles,
  selectRepoRework,
  selectRepoSummaries
} from '../../lib/selectors'
import {
  KpiDrillGrid,
  JiraHiddenNotice,
  Meter,
  OpenButton,
  PERIOD_CHIP,
  PR_COLUMN,
  ScopeHeader,
  Subsection,
  authorshipRows,
  authorshipSlices,
  lines,
  plural
} from './scope.jsx'
import { DeliverySnapshot } from './DeliverySnapshot.jsx'
import { overviewCards } from './overview-cards.jsx'
import { PersonaPanel, personaPanelState } from './PersonaPanel.jsx'

const DRILL_ID = 'overview-drill'

/**
 * Project overview: the project's KPI cards with a by-repository drill panel,
 * the live commit stream, adoption and persona subsections, then the
 * repository comparison one scope down (docs/design-system.md §7).
 */
export function OverviewView({
  projectSlug,
  projectType = 'ai-adopted',
  payloads,
  allPayloads,
  windowKey,
  mappingsByHandle,
  personaStatus = 'success',
  onOpenRepo,
  onOpenRepoCycle,
  onOpenContributor,
  onOpenLeverage,
  leverageData,
  sonarAsOf,
  sprintWindows,
  jiraConnected = false,
  canAdminister = false,
  jiraDelivery,
  deliveryWindow,
  deliveryHref,
  onOpenTicket,
  onOpenPR,
  insightsHref
}) {
  const projectId = useId()
  const reposId = useId()
  const [streamPaused, toggleStreamPaused] = useLiveStreamPaused()
  const history = allPayloads ?? payloads
  const summary = useMemo(() => selectGlobalSummary(payloads), [payloads])
  const delivery = useMemo(
    () => selectDeliverySummary(payloads, history),
    [payloads, history]
  )
  const repos = useMemo(() => selectRepoSummaries(payloads), [payloads])
  const repoByName = useMemo(
    () => new Map(repos.map((r) => [r.name, r.repository])),
    [repos]
  )
  const contributors = useMemo(
    () => selectContributorSummaries(payloads),
    [payloads]
  )
  const matrix = useMemo(
    () => selectContributorRepoMatrix(payloads),
    [payloads]
  )
  const timeline = useMemo(() => selectCommitTimeline(payloads), [payloads])
  const repoProfiles = useMemo(() => selectRepoProfiles(payloads), [payloads])
  const rework = useMemo(() => selectRepoRework(payloads), [payloads])
  const repoCycle = useMemo(() => selectRepoCycleTimes(payloads), [payloads])
  const leverage = useMemo(
    () => selectCopilotLeverage(payloads, history),
    [payloads, history]
  )
  const usage = useMemo(() => selectCopilotUsage(payloads), [payloads])
  const personas = useMemo(
    () =>
      selectPersonaSummaries(payloads, mappingsByHandle).filter((persona) =>
        PERSONAS.some((p) => p.id === persona.id)
      ),
    [payloads, mappingsByHandle]
  )

  const comparison = useMemo(() => {
    const cycleBy = new Map(repoCycle.map((r) => [r.repository, r]))
    const reworkBy = new Map(rework.repos.map((r) => [r.repository, r]))
    return repos.map((r) => ({
      ...r,
      avgCycleHours: cycleBy.get(r.repository)?.avgCycleHours ?? 0,
      reworkRatio: reworkBy.get(r.repository)?.reworkRatio ?? 0
    }))
  }, [repos, repoCycle, rework])

  const heatmapRows = useMemo(() => {
    const cells = new Map(matrix.data.map(([x, y, v]) => [`${x}|${y}`, v]))
    return matrix.contributors.map((contributor, y) => [
      contributor,
      ...matrix.repos.map((_, x) => cells.get(`${x}|${y}`) ?? 'No commits')
    ])
  }, [matrix])

  const openRepo = (repository) => () => onOpenRepo(repository)
  const scope = 'show breakdown by repository'

  const displayCards = overviewCards(
    {
      summary,
      delivery,
      repos,
      repoCycle,
      rework,
      leverage,
      leverageData,
      onOpenLeverage,
      onOpenRepoCycle,
      openRepo
    },
    projectType
  )

  return (
    <>
      <section className="app-scope" aria-labelledby={projectId}>
        <ScopeHeader
          id={projectId}
          level="At a glance"
          icon="layers"
          title="Key Metrics"
          meta={`${plural(repos.length, 'repository', 'repositories')} · ${plural(contributors.length, 'contributor')}`}
        />

        <KpiDrillGrid
          kpis={displayCards}
          drillId={DRILL_ID}
          actionText={scope}
        />

        <div className="govuk-!-margin-top-6">
          <ChartFigure
            number={1}
            title="Live commit stream"
            subtitle="Lines touched per counted commit, Copilot-assisted and human-authored, replayed in order across the selected period"
            description={`${summary.copilotAssistedCommits} of ${summary.totalCommits} counted commits were Copilot-assisted (purple circles) and ${summary.humanAuthoredCommits} were human-authored (orange diamonds). Rebase and merge commits are excluded.`}
            family="adoption"
            icon="commit"
            actions={
              <LiveStreamControls
                paused={streamPaused}
                onToggle={toggleStreamPaused}
              />
            }
            columns={[
              { id: 'commit', label: 'Commit' },
              { id: 'repo', label: 'Repository' },
              PR_COLUMN,
              { id: 'class', label: 'Classification' },
              { id: 'lines', label: 'Lines touched', numeric: true }
            ]}
            rows={timeline.map((c) => [
              c.commit,
              c.repoName,
              `#${c.prNumber}`,
              c.classification,
              c.linesTouched
            ])}
          >
            <LiveCommitStream
              key={windowKey}
              timeline={timeline}
              paused={streamPaused}
            />
          </ChartFigure>
        </div>

        <Subsection title="Adoption" family="assist" icon="sparkle">
          <div className="app-grid">
            <ChartFigure
              number={2}
              title="Commit composition"
              subtitle="Counted commits by classification, selected period"
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
              number={3}
              title="Line composition"
              subtitle="Lines touched by classification, selected period"
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
          </div>
        </Subsection>

        <CopilotUsagePanel
          usage={usage}
          insightsHref={insightsHref}
          headingLevel={3}
          meta="Model level, never per person"
        />

        {jiraConnected ? (
          <DeliverySnapshot
            delivery={jiraDelivery}
            payloads={payloads}
            window={deliveryWindow}
            deliveryHref={deliveryHref}
            onOpenTicket={onOpenTicket}
            onOpenPR={onOpenPR}
          />
        ) : (
          <JiraHiddenNotice canAdminister={canAdminister} />
        )}

        <Subsection
          title="Personas"
          family="output"
          icon="users"
          meta="Mapped in Settings"
        >
          <div className="app-kpi-grid app-kpi-grid--3">
            {personas.map((persona) => (
              <PersonaPanel
                key={persona.id}
                persona={persona}
                state={personaPanelState(personaStatus)}
              />
            ))}
          </div>
        </Subsection>
      </section>

      <section
        className="app-scope"
        id="repositories"
        aria-labelledby={reposId}
      >
        <ScopeHeader
          id={reposId}
          level="Compare"
          icon="repo"
          title="Repositories"
          meta="Select a repository to see its pull requests"
        />

        <Panel
          title="Repository comparison"
          family="speed"
          icon="grid"
          aside={<PeriodChip />}
          className="app-compare"
        >
          <PanelState
            state={comparison.length ? 'populated' : 'empty'}
            title="Repository comparison"
            icon="repo"
          >
            <Table
              className="govuk-!-margin-bottom-0"
              caption="Repository comparison for the selected period"
              captionHidden
              head={[
                { id: 'repo', label: 'Repository' },
                { id: 'prs', label: 'Pull requests', numeric: true },
                { id: 'assist', label: 'Commit assist rate' },
                { id: 'line', label: 'Line assist rate', numeric: true },
                { id: 'cycle', label: 'PR coding cycle time', numeric: true },
                { id: 'rework', label: 'PR rework ratio', numeric: true }
              ]}
              rows={comparison.map((r) => ({
                id: r.repository,
                cells: [
                  <OpenButton key="name" onClick={openRepo(r.repository)}>
                    {r.name}
                  </OpenButton>,
                  r.prCount,
                  <span key="assist" className="app-family--assist">
                    <Meter value={r.copilotAssistedRate} />
                    {r.copilotAssistedRate}%
                  </span>,
                  `${r.copilotAssistedLineRate}%`,
                  formatDuration(r.avgCycleHours),
                  r.reworkRatio
                ]
              }))}
            />
          </PanelState>
        </Panel>

        <div className="app-grid govuk-!-margin-top-5">
          <ChartFigure
            number={4}
            title="Commit assist rate by repository"
            subtitle="Commit assist rate by repository, percentage, selected period"
            description={
              repos.length
                ? `${repos[0].name} has the highest commit assist rate at ${repos[0].copilotAssistedRate}%; ${repos.at(-1).name} the lowest at ${repos.at(-1).copilotAssistedRate}%.`
                : undefined
            }
            family="assist"
            icon="bars"
            chip={PERIOD_CHIP}
            className="app-span-6"
            columns={[
              { id: 'repo', label: 'Repository' },
              { id: 'rate', label: 'Commit assist rate (%)', numeric: true }
            ]}
            rows={repos.map((r) => [r.name, r.copilotAssistedRate])}
          >
            <CategoryBar
              title="Commit assist rate by repository"
              categories={repos.map((r) => r.name)}
              values={repos.map((r) => r.copilotAssistedRate)}
              seriesName="commit assist rate"
              unit="%"
              colorByValue
              hideCategoryLabels
              showSelectList={false}
              onSelect={(i) => onOpenRepo(repos[i].repository)}
            />
          </ChartFigure>

          <ChartFigure
            number={5}
            title="Repository delivery profile"
            subtitle="Repository profile scores from 0 to 100, where higher is better, selected period"
            description="Each axis is normalised to 0 to 100: commit assist, line assist, adoption, delivery speed and rework control."
            family="leverage"
            icon="radar"
            chip={PERIOD_CHIP}
            className="app-span-6"
            columns={[
              { id: 'dim', label: 'Dimension' },
              ...repoProfiles.repos.map((r) => ({
                id: r.key,
                label: `${r.name} (score)`,
                numeric: true
              }))
            ]}
            rows={
              repoProfiles.repos.length
                ? repoProfiles.indicators.map((ind, i) => [
                    ind.name,
                    ...repoProfiles.repos.map((r) => r.values[i])
                  ])
                : []
            }
          >
            <ProfileRadar
              title="Repository delivery profile"
              subtitle="Commit assist, line assist, adoption, delivery speed and rework control per repository."
              indicators={repoProfiles.indicators}
              series={repoProfiles.repos}
              onSelect={(key) => onOpenRepo(key)}
            />
          </ChartFigure>

          <ChartFigure
            number={6}
            title="Assist Rate by Contributor and Repository"
            subtitle="Commit assist rate by contributor and repository, percentage, selected period. Blank cells mean no commits."
            family="leverage"
            icon="grid"
            chip={PERIOD_CHIP}
            className="app-span-12"
            columns={[
              { id: 'who', label: 'Contributor' },
              ...matrix.repos.map((name) => ({
                id: name,
                label: `${name} (%)`,
                numeric: true
              }))
            ]}
            rows={heatmapRows}
          >
            <ActivityHeatmap
              title="Commit assist rate by contributor and repository"
              xLabels={matrix.repos}
              yLabels={matrix.contributors}
              data={matrix.data}
              onSelectContributor={onOpenContributor}
              onSelectCell={(repoName, contributor) =>
                onOpenContributor(contributor, repoByName.get(repoName))
              }
            />
          </ChartFigure>
        </div>

        <div className="govuk-!-margin-top-6">
          <SonarPortfolioPanel
            projectSlug={projectSlug}
            onOpenRepo={onOpenRepo}
            asOf={sonarAsOf}
          />
        </div>
        {sprintWindows?.length > 0 && (
          <div className="govuk-!-margin-top-6">
            <SonarSprintTrend
              projectSlug={projectSlug}
              sprints={sprintWindows}
              number={7}
            />
          </div>
        )}
      </section>
    </>
  )
}
