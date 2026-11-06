import { useId, useMemo } from 'react'

import {
  ChartFigure,
  LiveStreamControls,
  Panel,
  PanelState,
  useLiveStreamPaused
} from '../dashboard'
import { Table } from '../govuk'
import { cx } from '../govuk/utils.js'
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
  if (status !== 'success') return <PanelState state="loading" icon="ticket" />
  return children
}

function LeverageCard({ title, children, footnote }) {
  return (
    <Panel title={title} family="leverage" icon="rocket" headingLevel={4}>
      {children}
      {footnote && <p className="govuk-body-s app-muted">{footnote}</p>}
    </Panel>
  )
}

function Figure({ label, value }) {
  return (
    <p className="govuk-body govuk-!-margin-bottom-2">
      <span className="app-muted">{label}</span>{' '}
      <strong className="govuk-!-font-size-24">{value}</strong>
    </p>
  )
}

const pctOrDash = (n) => (n === null || n === undefined ? '–' : `${n}%`)

/**
 * Overview for AI-Native projects (ADR 0005 §4): delivery measured to Jira
 * Done, with no adoption, assist-rate or classification measures.
 */
export function AiNativeOverviewView({
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
  const native = leverage.data
  const durability = native?.codeDurability
  const usage = useMemo(() => selectCopilotUsage(payloads), [payloads])
  // The ticket funnel is figure 2 and is absent without a Jira key.
  const figureShift = jiraConnected ? 0 : -1
  return (
    <>
      <section className="app-scope" aria-labelledby={projectId}>
        <ScopeHeader
          id={projectId}
          level={jiraConnected ? 'Jira · at a glance' : 'At a glance'}
          icon={jiraConnected ? 'ticket' : 'layers'}
          title={jiraConnected ? 'Delivery performance' : 'Project activity'}
          meta={
            jiraConnected
              ? `${plural(repos.length, 'repository', 'repositories')} · measured to Jira Done · team view, not individuals`
              : `${plural(repos.length, 'repository', 'repositories')} · team view, not individuals`
          }
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
          <SonarPortfolioPanel onOpenRepo={onOpenRepo} asOf={sonarAsOf} />
          {sprintWindows?.length > 0 && (
            <div className="govuk-!-margin-top-5">
              <SonarSprintTrend
                sprints={sprintWindows}
                number={3 + figureShift}
              />
            </div>
          )}
        </Subsection>

        <Subsection
          title="AI-Native Delivery Leverage"
          family="leverage"
          icon="rocket"
          meta={`${jiraConnected ? 4 : 3} components, side by side`}
        >
          {leverage.status === 'error' && (
            <PanelState
              state="error"
              icon="rocket"
              errorMessage="We could not load AI-Native Delivery Leverage. Try again later."
            />
          )}
          {leverage.status !== 'error' && !native && (
            <PanelState state="loading" icon="rocket" />
          )}
          {native && (
            <div
              className={cx(
                'app-kpi-grid',
                !jiraConnected && 'app-kpi-grid--3'
              )}
            >
              <LeverageCard
                title="Own-Baseline Trend"
                footnote={`Baseline: the project's first ${plural(native.ownBaseline.baselineSprintCount, 'sprint')}.`}
              >
                {native.ownBaseline.comparable ? (
                  <>
                    <Figure
                      label="PR coding cycle time"
                      value={`${native.ownBaseline.speedup}× faster`}
                    />
                    <p className="govuk-body-s">
                      Median{' '}
                      {formatDuration(
                        native.ownBaseline.currentMedianCycleHours
                      )}{' '}
                      now against{' '}
                      {formatDuration(
                        native.ownBaseline.baselineMedianCycleHours
                      )}{' '}
                      at baseline.
                    </p>
                  </>
                ) : (
                  <p className="govuk-body-s">
                    Not enough comparable pull requests (
                    {native.ownBaseline.baselineCount} baseline,{' '}
                    {native.ownBaseline.currentCount} now; 5 needed on each
                    side).
                  </p>
                )}
              </LeverageCard>
              <LeverageCard
                title="Complexity-Weighted Throughput"
                footnote="Sum of complexity scores of merged pull requests."
              >
                <Figure
                  label="Score"
                  value={native.complexityWeightedThroughput}
                />
                <p className="govuk-body-s">
                  From{' '}
                  {plural(native.mergedPullRequests, 'merged pull request')}.
                </p>
              </LeverageCard>
              {jiraConnected && (
                <LeverageCard
                  title="Delivery Quality"
                  footnote="Read together, not summed."
                >
                  <Figure
                    label="Change fail rate"
                    value={pctOrDash(native.deliveryQuality.changeFailRate)}
                  />
                  <Figure
                    label="Delivery rework rate"
                    value={pctOrDash(native.deliveryQuality.deliveryReworkRate)}
                  />
                  <Figure
                    label="Ticket reopen rate"
                    value={pctOrDash(native.deliveryQuality.reopenRate)}
                  />
                </LeverageCard>
              )}
              <LeverageCard
                title="AI Code Durability"
                footnote={
                  durability?.available
                    ? `Lines still present ${durability.windowDays} days after merge, across ${plural(durability.prCount, 'pull request')}.`
                    : undefined
                }
              >
                {durability?.available ? (
                  <>
                    <Figure
                      label="AI lines surviving"
                      value={pctOrDash(durability.aiSurvivalPercent)}
                    />
                    <Figure
                      label="Human lines surviving"
                      value={pctOrDash(durability.humanSurvivalPercent)}
                    />
                  </>
                ) : (
                  <PanelState
                    state="empty"
                    icon="clock"
                    emptyTag="Not available yet"
                    emptyMessage="Appears once merged pull requests are 21 days old and the survival workflow has measured them."
                  />
                )}
              </LeverageCard>
            </div>
          )}
          <div className="govuk-!-margin-top-5">
            <AiCodeChurnPanel
              churn={churn?.data}
              status={churn?.status}
              number={4 + figureShift}
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
                  r.medianCycleHours === null
                    ? '–'
                    : formatDuration(r.medianCycleHours)
                ]
              }))}
            />
          </PanelState>
        </Panel>
      </section>
    </>
  )
}
