import { useId, useMemo } from 'react'

import {
  ChartFigure,
  LiveStreamControls,
  Panel,
  PanelState,
  useLiveStreamPaused
} from '../dashboard'
import { Table } from '../govuk'
import { AiCodeChurnPanel } from '../AiCodeChurnPanel'
import { CopilotUsagePanel } from '../CopilotUsagePanel'
import { CategoryBar } from '../charts/CategoryBar'
import { LiveCommitStream } from '../charts/LiveCommitStream'
import { SonarPortfolioPanel, SonarSprintTrend } from '../charts/SonarQuality'
import {
  FUNNEL_STAGES,
  formatDuration,
  selectCommitTimeline,
  selectCopilotUsage,
  selectDoneTickets,
  selectNativeRepoComparison,
  selectTicketFunnel,
  selectTicketRows
} from '../../lib/selectors'
import { buildDeliveryKpis } from './delivery-kpis.js'
import { NativeLeverage } from './NativeLeverage.jsx'
import {
  JiraHiddenNotice,
  KpiDrillGrid,
  METRICS_DOC,
  OpenButton,
  ScopeHeader,
  Subsection,
  plural
} from './scope.jsx'

const DELIVERY_KPIS = [
  'changeLead',
  'frequency',
  'defectRecovery',
  'changeFail',
  'rework'
]
const FLOW_KPIS = ['predictability', 'flow', 'cycle', 'prCycle']
const SONAR_TREND_FIGURE = 3
const CHURN_FIGURE = 4
const LEVERAGE_PARTS = 4

function headerProps(jiraConnected, repoCount) {
  const repos = plural(repoCount, 'repository', 'repositories')
  if (!jiraConnected) {
    return {
      level: 'At a glance',
      icon: 'layers',
      title: 'Project activity',
      meta: `${repos} · team view, not individuals`
    }
  }
  return {
    level: 'Jira · at a glance',
    icon: 'ticket',
    title: 'Delivery performance',
    meta: `${repos} · measured to Jira Done · team view, not individuals`
  }
}

const medianCycle = (hours) => (hours === null ? '–' : formatDuration(hours))

function MetricsState({ status, children }) {
  if (status === 'error') {
    return (
      <PanelState
        state="error"
        icon="ticket"
        errorMessage="We could not load delivery metrics. Try again later."
      />
    )
  }
  if (status !== 'success') {
    return <PanelState state="loading" icon="ticket" />
  }
  return children
}

/**
 * Overview for AI-Native projects (ADR 0005 §4): delivery measured to Jira
 * Done, with no adoption, assist-rate or classification measures.
 */
export function AiNativeOverviewView({
  projectSlug,
  payloads,
  windowKey,
  window,
  delivery,
  leverage,
  churn,
  jiraConnected = false,
  canAdminister = false,
  onOpenRepo,
  onOpenTicket,
  onOpenPR,
  sonarAsOf,
  sprintWindows,
  insightsHref
}) {
  const projectId = useId()
  const reposId = useId()
  const [streamPaused, toggleStreamPaused] = useLiveStreamPaused()
  const timeline = useMemo(() => selectCommitTimeline(payloads), [payloads])
  const repos = useMemo(() => selectNativeRepoComparison(payloads), [payloads])
  const { metrics, issues, status } = delivery
  const rows = useMemo(
    () => selectTicketRows(issues, payloads),
    [issues, payloads]
  )
  const done = useMemo(
    () => selectDoneTickets(rows, window?.start, window?.end),
    [rows, window?.start, window?.end]
  )
  const funnel = useMemo(() => selectTicketFunnel(rows), [rows])
  const kpis = useMemo(
    () =>
      metrics
        ? buildDeliveryKpis({ metrics, done, onOpenTicket, onOpenPR })
        : null,
    [metrics, done, onOpenTicket, onOpenPR]
  )
  const usage = useMemo(() => selectCopilotUsage(payloads), [payloads])
  // The ticket funnel is figure 2 and is absent without a Jira key.
  const figureShift = jiraConnected ? 0 : -1
  return (
    <>
      <section className="app-scope" aria-labelledby={projectId}>
        <ScopeHeader
          id={projectId}
          {...headerProps(jiraConnected, repos.length)}
        />
        {jiraConnected ? (
          <MetricsState status={status}>
            {kpis && (
              <KpiDrillGrid
                kpis={DELIVERY_KPIS.map((id) => kpis[id])}
                drillId="native-delivery-drill"
                actionText="tickets"
              />
            )}
          </MetricsState>
        ) : (
          <JiraHiddenNotice canAdminister={canAdminister} />
        )}

        <div className="govuk-!-margin-top-6">
          <ChartFigure
            number={1}
            title="Live Commit Stream"
            subtitle="Lines touched per counted commit, coloured by repository, replayed in order across the period"
            family="output"
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
              { id: 'lines', label: 'Lines touched', numeric: true }
            ]}
            rows={timeline.map((c) => [
              c.commit,
              c.repoName,
              `#${c.prNumber}`,
              c.linesTouched
            ])}
          >
            <LiveCommitStream
              key={windowKey}
              timeline={timeline}
              paused={streamPaused}
              colorBy="repository"
            />
          </ChartFigure>
        </div>

        {jiraConnected && (
          <Subsection
            title="Flow And Predictability"
            family="leverage"
            icon="flow"
          >
            <MetricsState status={status}>
              {kpis && (
                <KpiDrillGrid
                  kpis={FLOW_KPIS.map((id) => kpis[id])}
                  drillId="native-flow-drill"
                  actionText="tickets"
                />
              )}
              <div className="govuk-!-margin-top-5">
                <ChartFigure
                  number={2}
                  title="Where Tickets Are"
                  subtitle="Number of the project's Jira tickets at each stage."
                  family="leverage"
                  icon="funnel"
                  columns={[
                    { id: 'stage', label: 'Stage' },
                    { id: 'tickets', label: 'Tickets', numeric: true }
                  ]}
                  rows={FUNNEL_STAGES.map((stage, i) => [stage, funnel[i]])}
                >
                  <CategoryBar
                    title="Where tickets are"
                    categories={FUNNEL_STAGES}
                    values={funnel}
                    seriesName="Tickets"
                    horizontal
                    height={220}
                  />
                </ChartFigure>
              </div>
            </MetricsState>
          </Subsection>
        )}

        <Subsection
          title="Quality At Sprint End"
          family="quality"
          icon="shield"
        >
          <SonarPortfolioPanel
            projectSlug={projectSlug}
            onOpenRepo={onOpenRepo}
            asOf={sonarAsOf}
          />
          {sprintWindows?.length > 0 && (
            <div className="govuk-!-margin-top-5">
              <SonarSprintTrend
                projectSlug={projectSlug}
                sprints={sprintWindows}
                number={SONAR_TREND_FIGURE + figureShift}
              />
            </div>
          )}
        </Subsection>

        <Subsection
          title="AI-Native Delivery Leverage"
          family="leverage"
          icon="rocket"
          meta={`${jiraConnected ? LEVERAGE_PARTS : LEVERAGE_PARTS - 1} components, side by side`}
        >
          <NativeLeverage leverage={leverage} jiraConnected={jiraConnected} />
          <div className="govuk-!-margin-top-5">
            <AiCodeChurnPanel
              churn={churn?.data}
              status={churn?.status}
              number={CHURN_FIGURE + figureShift}
            />
          </div>
          <div className="govuk-!-margin-top-5">
            <CopilotUsagePanel usage={usage} insightsHref={insightsHref} />
          </div>
          <p className="govuk-body-s govuk-!-margin-top-3">
            <a
              className="govuk-link"
              href={`${METRICS_DOC}#metric-own-baseline-trend`}
            >
              How AI-Native Delivery Leverage works
            </a>
          </p>
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
        <Panel title="Repository Comparison" family="speed" icon="grid">
          <PanelState
            state={repos.length ? 'populated' : 'empty'}
            title="Repository comparison"
            icon="repo"
          >
            <Table
              className="govuk-!-margin-bottom-0"
              caption="Repository comparison for the period"
              captionHidden
              head={[
                { id: 'repo', label: 'Repository' },
                { id: 'merged', label: 'Merged PRs', numeric: true },
                { id: 'complexity', label: 'Median complexity', numeric: true },
                { id: 'cycle', label: 'PR coding cycle time', numeric: true }
              ]}
              rows={repos.map((r) => ({
                id: r.repository,
                cells: [
                  <OpenButton
                    key="name"
                    onClick={() => onOpenRepo(r.repository)}
                  >
                    {r.name}
                  </OpenButton>,
                  r.merged,
                  r.medianComplexity ?? '–',
                  medianCycle(r.medianCycleHours)
                ]
              }))}
            />
          </PanelState>
        </Panel>
      </section>
    </>
  )
}
