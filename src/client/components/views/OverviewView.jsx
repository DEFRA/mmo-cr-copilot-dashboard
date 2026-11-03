import { useId, useMemo } from 'react'

import {
  ChartFigure,
  LiveStreamControls,
  MiniBars,
  Panel,
  PanelState,
  PeriodChip,
  ProgressRing,
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
  Meter,
  OpenButton,
  PERIOD_CHIP,
  ScopeHeader,
  Subsection,
  lines,
  plural
} from './scope.jsx'
import { DeliverySnapshot } from './DeliverySnapshot.jsx'

const DRILL_ID = 'overview-drill'

const PERSONA_STYLE = {
  developer: { family: 'leverage', icon: 'code' },
  devops: { family: 'speed', icon: 'merge' },
  qa: { family: 'assist', icon: 'check' }
}

function PersonaPanel({ persona, state }) {
  const style = PERSONA_STYLE[persona.id]
  const idle = persona.totalCommits === 0
  const panelState = state === 'populated' && idle ? 'empty' : state

  return (
    <Panel
      title={persona.label}
      family={style.family}
      icon={style.icon}
      headingLevel={4}
      busy={state === 'loading'}
      aside={
        state === 'populated' && (
          <span className="app-mini-tag">
            {plural(persona.contributorCount, 'person', 'people')}
          </span>
        )
      }
    >
      <PanelState
        state={panelState}
        title={persona.label}
        icon="users"
        emptyMessage="No activity from this role in the selected period."
        errorMessage="We could not load the persona mappings. Try again later."
      >
        <dl className="app-stat-list">
          <div className="app-stat-list__row">
            <dt>Copilot adoption</dt>
            <dd>{persona.adoptionPct}%</dd>
            <Meter value={persona.adoptionPct} />
          </div>
          <div className="app-stat-list__row">
            <dt>Commit assist rate</dt>
            <dd>{persona.copilotAssistedRate}%</dd>
            <Meter value={persona.copilotAssistedRate} />
          </div>
          <div className="app-stat-list__row">
            <dt>Line assist rate</dt>
            <dd>{persona.copilotAssistedLineRate}%</dd>
          </div>
          <div className="app-stat-list__row">
            <dt>Contributors (adopters)</dt>
            <dd>
              {persona.contributorCount} ({persona.adopters})
            </dd>
          </div>
          <div className="app-stat-list__row">
            <dt>Pull requests</dt>
            <dd>{persona.prCount}</dd>
          </div>
          <div className="app-stat-list__row">
            <dt>Copilot commits</dt>
            <dd>
              {persona.copilotAssistedCommits} of {persona.totalCommits}
            </dd>
          </div>
          <div className="app-stat-list__row">
            <dt>Net lines delivered</dt>
            <dd>{lines(persona.netLines)}</dd>
          </div>
          <div className="app-stat-list__row">
            <dt>PR coding cycle time</dt>
            <dd>{formatDuration(persona.avgCycleHours)}</dd>
          </div>
        </dl>
        <details className="govuk-details govuk-!-margin-top-3 govuk-!-margin-bottom-0">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Repositories ({persona.repoNames.length})
            </span>
          </summary>
          <div className="govuk-details__text">
            {persona.repoNames.join(' · ')}
          </div>
        </details>
      </PanelState>
    </Panel>
  )
}

const personaPanelState = (status) => {
  if (status === 'loading' || status === 'idle') return 'loading'
  if (status === 'error') return 'error'
  return 'populated'
}

/**
 * Project overview: the project's KPI cards with a by-repository drill panel,
 * the live commit stream, adoption and persona subsections, then the
 * repository comparison one scope down (docs/design-system.md §7).
 */
export function OverviewView({
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
  const v2Available = Boolean(leverageData)
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

  const cards = [
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
        title: 'Copilot adoption by repository',
        items: repos.map((r) => ({
          key: r.repository,
          name: r.name,
          value: plural(r.contributorCount, 'contributor'),
          sub: `${r.copilotAssistedCommits} of ${r.totalCommits} commits Copilot-assisted · ${plural(r.prCount, 'pull request')}`,
          onOpen: openRepo(r.repository)
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
      sub: `${summary.copilotAssistedCommits} of ${summary.totalCommits} commits`,
      chart: <ProgressRing value={summary.copilotAssistedRate} />,
      drill: {
        title: 'Commit assist rate by repository',
        items: repos.map((r) => ({
          key: r.repository,
          name: r.name,
          value: `${r.copilotAssistedRate}%`,
          sub: `${r.copilotAssistedCommits} of ${r.totalCommits} commits · line assist ${r.copilotAssistedLineRate}% · ${plural(r.prCount, 'pull request')}`,
          pct: r.copilotAssistedRate,
          onOpen: openRepo(r.repository)
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
        title: 'Line assist rate by repository',
        items: repos.map((r) => ({
          key: r.repository,
          name: r.name,
          value: `${r.copilotAssistedLineRate}%`,
          sub: `${lines(r.copilotAssistedLines)} Copilot and ${lines(r.humanAuthoredLines)} human-authored of ${lines(r.totalLinesTouched)} lines`,
          pct: r.copilotAssistedLineRate,
          onOpen: openRepo(r.repository)
        }))
      }
    },
    {
      id: 'leverage',
      label: 'Copilot Leverage',
      anchor: 'metric-copilot-leverage',
      family: 'leverage',
      icon: 'rocket',
      ...(leverageData
        ? {
            value: leverageData.enoughData
              ? String(leverageData.overallLeverageScore)
              : '–',
            unit: leverageData.enoughData ? '×' : undefined,
            sub: leverageData.enoughData
              ? `${leverageData.comparableBands} comparable ${leverageData.comparableBands === 1 ? 'band' : 'bands'} · ${leverageData.sampleSize.adopted} adopted PRs`
              : 'Not enough comparable pull requests yet'
          }
        : {
            value: String(delivery.copilotLeverage),
            unit: '%',
            sub: delivery.leverageFlowAvailable
              ? `Coverage ${delivery.leverageCoverage}% · adoption ${delivery.leverageAdoption}% · ${delivery.leverageFlowRatio}× faster than baseline`
              : `Coverage ${delivery.leverageCoverage}% · adoption ${delivery.leverageAdoption}% · no speed baseline yet`
          }),
      chart: v2Available ? undefined : (
        <ProgressRing value={delivery.copilotLeverage} />
      ),
      drill: leverageData
        ? {
            title: 'Copilot Leverage by repository',
            ...(onOpenLeverage && {
              more: { text: 'How this is calculated', onOpen: onOpenLeverage }
            }),
            intro: `Compares median PR coding cycle times within each complexity band against the pre-adoption baseline, standardised on the current period’s mix. Read with PR rework ratio: ${delivery.reworkRatio}.`,
            items: Object.entries(leverageData.bandComparison ?? {}).map(
              ([band, b]) => ({
                key: band,
                name: `Band ${band}`,
                value: b.comparable ? `${b.speedup}×` : 'Not comparable',
                sub: `${b.baselineCount} baseline PRs vs ${b.adoptedCount} adopted · median ${b.baselineMedianCycleHours}h vs ${b.adoptedMedianCycleHours}h`,
                onOpen: onOpenLeverage
              })
            )
          }
        : {
            title: 'Copilot Leverage by repository',
            ...(onOpenLeverage && {
              more: { text: 'How this is calculated', onOpen: onOpenLeverage }
            }),
            intro: `Geometric mean of coverage, efficiency (current Copilot speed against a historical manually-led baseline) and adoption, 0 to 100. Read with PR rework ratio: ${delivery.reworkRatio}.`,
            items: leverage.repos.map((r) => ({
              key: r.repository,
              name: r.name,
              value: `${r.leveragePct}%`,
              sub: [
                `Coverage ${r.coverage}% · efficiency ${r.efficiency}% · adoption ${r.adoption}%`,
                r.flowAvailable
                  ? `${r.flowRatio}× faster: median ${formatDuration(r.copilotMedianCycleHours)} now against ${formatDuration(r.baselineMedianCycleHours)} baseline (${r.baselineLocal ? `this repository, ${r.baselineCount} historical PRs` : `portfolio-wide, ${r.baselineCount} PRs`})`
                  : 'No speed baseline yet'
              ].join(' · '),
              pct: r.leveragePct,
              onOpen: openRepo(r.repository)
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
      chart: <MiniBars data={repoCycle.map((r) => r.avgCycleHours)} />,
      drill: {
        title: 'PR coding cycle time by repository',
        hint: ': pull request cycle times',
        items: repoCycle.map((r) => ({
          key: r.repository,
          name: r.name,
          value: formatDuration(r.avgCycleHours),
          sub: `Fastest ${formatDuration(r.fastest)} · slowest ${formatDuration(r.slowest)} · ${plural(r.prCount, 'pull request')}`,
          onOpen: () => onOpenRepoCycle(r.repository)
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
      chart: <MiniBars data={rework.repos.map((r) => r.reworkRatio)} />,
      drill: {
        title: 'PR rework ratio by repository',
        intro:
          'Lines deleted per line added, per repository, excluding rebase and merge commits. The project ratio weights these by lines added.',
        items: rework.repos.map((r) => ({
          key: r.repository,
          name: r.name,
          value: String(r.reworkRatio),
          sub: `${lines(r.linesDeleted)} deleted per ${lines(r.linesAdded)} added · ${plural(r.prCount, 'pull request')}`,
          onOpen: openRepo(r.repository)
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
      chart: <MiniBars data={repos.map((r) => r.avgCommitSize)} />,
      drill: {
        title: 'Average batch size by repository',
        items: repos.map((r) => ({
          key: r.repository,
          name: r.name,
          value: `${r.avgCommitSize} lines`,
          sub: `${lines(r.totalLinesTouched)} lines over ${plural(r.totalCommits, 'commit')}`,
          onOpen: openRepo(r.repository)
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
      chart: <MiniBars data={rework.repos.map((r) => r.netLines)} />,
      drill: {
        title: 'Net lines delivered by repository',
        items: rework.repos.map((r) => ({
          key: r.repository,
          name: r.name,
          value: lines(r.netLines),
          sub: `${lines(r.linesAdded)} added minus ${lines(r.linesDeleted)} deleted`,
          onOpen: openRepo(r.repository)
        }))
      }
    }
  ]

  const isNative = projectType === 'ai-native'
  const displayCards = isNative
    ? cards.filter(
        (c) =>
          c.id !== 'adoption' &&
          c.id !== 'commit-assist' &&
          c.id !== 'line-assist' &&
          c.id !== 'assist' &&
          c.id !== 'linerate'
      )
    : cards

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
              { id: 'pr', label: 'Pull request' },
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
          </div>
        </Subsection>

        <Subsection
          title="Copilot Usage"
          family="leverage"
          icon="sparkle"
          meta="Model level, never per person"
        >
          <CopilotUsagePanel usage={usage} insightsHref={insightsHref} />
        </Subsection>

        {jiraDelivery && (
          <DeliverySnapshot
            delivery={jiraDelivery}
            payloads={payloads}
            window={deliveryWindow}
            deliveryHref={deliveryHref}
            onOpenTicket={onOpenTicket}
            onOpenPR={onOpenPR}
          />
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
          <SonarPortfolioPanel onOpenRepo={onOpenRepo} asOf={sonarAsOf} />
        </div>
        {sprintWindows?.length > 0 && (
          <div className="govuk-!-margin-top-6">
            <SonarSprintTrend sprints={sprintWindows} number={7} />
          </div>
        )}
      </section>
    </>
  )
}
