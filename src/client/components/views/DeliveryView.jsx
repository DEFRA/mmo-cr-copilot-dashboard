import { useId, useMemo } from 'react'

import { ChartFigure, JiraStatusTag, Panel, PanelState } from '../dashboard'
import {
  InsetText,
  SortableTable,
  SummaryList,
  Tag,
  WarningText
} from '../govuk'
import { CategoryBar } from '../charts/CategoryBar'
import { TrendLine } from '../charts/TrendLine'
import {
  FUNNEL_STAGES,
  selectDoneTickets,
  selectTicketFunnel,
  selectTicketRows,
  shortRepoName
} from '../../lib/selectors'
import { toHash } from '../../lib/routes'
import {
  KpiDrillGrid,
  OpenButton,
  ScopeHeader,
  Subsection,
  plural
} from './scope.jsx'
import { buildDeliveryKpis } from './delivery-kpis.js'
import { JiraNotices, formatDateTime } from './JiraNotices.jsx'

export { JiraNotices }

// The trend charts are figures 1 and 2 when there is more than one sprint.
const TREND_FIGURES = 2

const DELIVERY_GROUPS = [
  {
    id: 'dora',
    title: 'Delivery-based DORA',
    family: 'speed',
    icon: 'rocket',
    meta: 'Measured to Jira Done, not to deployment',
    kpis: ['changeLead', 'frequency', 'changeFail', 'defectRecovery', 'rework']
  },
  {
    id: 'flow',
    title: 'Flow',
    family: 'output',
    icon: 'layers',
    kpis: [
      'throughput',
      'storyPoints',
      'bugsDelivered',
      'otherDelivered',
      'cycle',
      'lead',
      'flow',
      'wip',
      'predictability',
      'prsPerTicket',
      'prCycle'
    ]
  },
  {
    id: 'quality',
    title: 'Quality and data hygiene',
    family: 'quality',
    icon: 'shield',
    kpis: ['sdu', 'firstScan', 'qant', 'vsp', 'reopen', 'unlinked']
  }
]

// Kept for the overview, which shows a short pick of the same cards.
export const DELIVERY_KPIS = DELIVERY_GROUPS.flatMap((g) => g.kpis)
const NOT_CONNECTED =
  'Jira delivery metrics are not available because this project has no Jira project key.'

const days = (n) => (n === null || n === undefined ? '–' : `${n} days`)

const prLabel = (pr) => `${shortRepoName(pr.repository)} #${pr.prNumber}`

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
})
const formatDate = (ms) => (ms === null ? '–' : DATE.format(ms))

function DeliveryState({ status, jiraConnected, children }) {
  if (!jiraConnected) {
    return (
      <PanelState state="empty" icon="ticket" emptyMessage={NOT_CONNECTED} />
    )
  }
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

/** Statuses outside every workflow stage; shown to project admins only. */
export function UnmappedStatusesNotice({ workflow, canAdminister }) {
  const unmapped = (workflow?.unmappedStatuses ?? []).filter(
    (s) => typeof s?.name === 'string'
  )
  if (!canAdminister || unmapped.length === 0) {
    return null
  }
  return (
    <InsetText>
      {plural(unmapped.length, 'Jira status', 'Jira statuses')} not in any
      workflow stage: {unmapped.map((s) => s.name).join(', ')}. Tickets in these
      statuses may be timed wrongly.{' '}
      <a
        className="govuk-link"
        href={toHash({ level: 'settings', tab: 'jira-workflow' })}
      >
        Map them in Settings, under JIRA
      </a>
      {'.'}
    </InsetText>
  )
}

/** Delivery measured to Jira Done for the selected period (E5-S8). */
export function DeliveryView({
  delivery,
  trend,
  payloads,
  window,
  jiraConnected,
  canAdminister = false,
  onOpenTicket,
  onOpenPR
}) {
  const headingId = useId()
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
  const inProgress = useMemo(
    () => rows.filter((r) => r.category === 'indeterminate'),
    [rows]
  )
  const unlinked = useMemo(
    () =>
      payloads.filter(
        (p) => !Array.isArray(p.jiraKeys) || p.jiraKeys.length === 0
      ),
    [payloads]
  )

  const groups = useMemo(() => {
    if (!metrics) {
      return []
    }
    const all = buildDeliveryKpis({
      metrics,
      done,
      unlinked,
      inProgress,
      onOpenTicket,
      onOpenPR
    })
    return DELIVERY_GROUPS.map((g) => ({
      ...g,
      cards: g.kpis.map((id) => all[id])
    }))
  }, [metrics, done, unlinked, inProgress, onOpenTicket, onOpenPR])
  const points = trend?.points ?? []

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      <ScopeHeader
        id={headingId}
        level="Jira"
        icon="ticket"
        title="Delivery"
        meta="Measured to Jira Done"
      />
      <DeliveryState status={status} jiraConnected={jiraConnected}>
        <JiraNotices metrics={metrics} canAdminister={canAdminister} />
        <UnmappedStatusesNotice
          workflow={metrics?.workflow}
          canAdminister={canAdminister}
        />
        {metrics?.warnings?.length > 0 && (
          <WarningText>
            {plural(metrics.warnings.length, 'ticket')} marked Done still{' '}
            {metrics.warnings.length === 1 ? 'has' : 'have'} an open pull
            request:{' '}
            {metrics.warnings.map((w, i) => (
              <span key={w.key}>
                {i > 0 && ', '}
                <OpenButton onClick={() => onOpenTicket(w.key)}>
                  {w.key}
                </OpenButton>
              </span>
            ))}
          </WarningText>
        )}

        {groups.map((g) => (
          <Subsection
            key={g.id}
            title={g.title}
            family={g.family}
            icon={g.icon}
            meta={g.meta}
          >
            <KpiDrillGrid
              kpis={g.cards}
              drillId={`delivery-drill-${g.id}`}
              actionText="tickets"
            />
          </Subsection>
        ))}

        {points.length > 1 && (
          <Subsection title="By sprint" family="leverage" icon="trend">
            <div className="app-grid">
              <ChartFigure
                number={1}
                title="Stories Delivered per Sprint"
                subtitle="Stories that reached Done in each sprint. Tasks and sub-tasks count toward their parent story; bugs are counted separately."
                family="output"
                icon="layers"
                className="app-span-6"
                columns={[
                  { id: 'sprint', label: 'Sprint' },
                  { id: 'delivered', label: 'Delivered', numeric: true }
                ]}
                rows={points.map((p) => [p.label, p.delivered ?? '–'])}
              >
                <CategoryBar
                  title="Stories delivered per sprint"
                  categories={points.map((p) => p.label)}
                  values={points.map((p) => p.delivered ?? 0)}
                  seriesName="Delivered"
                  height={260}
                />
              </ChartFigure>
              <ChartFigure
                number={2}
                title="Predictability and Change Fail"
                subtitle="Committed tickets finished, and Done tickets that failed within 14 days, per sprint."
                family="quality"
                icon="target"
                className="app-span-6"
                columns={[
                  { id: 'sprint', label: 'Sprint' },
                  { id: 'pred', label: 'Predictability (%)', numeric: true },
                  { id: 'fail', label: 'Change fail (%)', numeric: true }
                ]}
                rows={points.map((p) => [
                  p.label,
                  p.predictability ?? '–',
                  p.changeFailRate ?? '–'
                ])}
              >
                <TrendLine
                  title="Predictability and change fail by sprint"
                  unit="%"
                  height={260}
                  categories={points.map((p) => p.label)}
                  series={[
                    {
                      name: 'Predictability',
                      colorToken: 'success',
                      data: points.map((p) => p.predictability)
                    },
                    {
                      name: 'Change fail',
                      colorToken: 'accent',
                      data: points.map((p) => p.changeFailRate)
                    }
                  ]}
                />
              </ChartFigure>
            </div>
          </Subsection>
        )}

        <div className="app-grid">
          <ChartFigure
            number={points.length > 1 ? TREND_FIGURES + 1 : 1}
            title="Where tickets are"
            subtitle="Number of the project's Jira tickets at each stage. A ticket whose linked pull requests have all merged counts as PR merged until it reaches Done."
            family="leverage"
            icon="funnel"
            className="app-span-12"
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
              height={240}
            />
          </ChartFigure>
        </div>

        <Panel
          title="Tickets"
          family="leverage"
          icon="ticket"
          className="app-compare"
        >
          {rows.length === 0 ? (
            <PanelState
              state="empty"
              emptyMessage="No Jira tickets are linked to this project's pull requests yet. A ticket appears here once a pull request names it in its branch, title or commit messages."
            />
          ) : (
            <SortableTable
              className="govuk-!-margin-bottom-0"
              caption="Jira tickets"
              captionHidden
              head={[
                { id: 'key', label: 'Ticket' },
                { id: 'type', label: 'Type' },
                { id: 'status', label: 'Status' },
                { id: 'cycle', label: 'Cycle time (days)', numeric: true },
                { id: 'prs', label: 'Linked PRs', numeric: true }
              ]}
              rows={rows.map((r) => ({
                id: r.key,
                cells: [
                  {
                    content: (
                      <OpenButton
                        onClick={() => onOpenTicket(r.key)}
                        hint={r.summary ? `: ${r.summary}` : undefined}
                      >
                        {r.key}
                      </OpenButton>
                    ),
                    sortValue: r.key
                  },
                  r.type,
                  {
                    content: <JiraStatusTag status={r.status} />,
                    sortValue: r.status
                  },
                  {
                    content: r.cycleDays ?? '–',
                    sortValue: r.cycleDays ?? -1
                  },
                  r.prs.length
                ]
              }))}
            />
          )}
        </Panel>
      </DeliveryState>
    </section>
  )
}

/** One Jira ticket and the pull requests linked to it. */
export function TicketView({
  ticketKey,
  delivery,
  payloads,
  jiraConnected,
  canAdminister = false,
  onOpenTicket,
  onOpenPR
}) {
  const headingId = useId()
  const { issues, status } = delivery
  const row = useMemo(
    () => selectTicketRows(issues, payloads).find((r) => r.key === ticketKey),
    [issues, payloads, ticketKey]
  )

  return (
    <section className="app-scope" aria-labelledby={headingId}>
      <ScopeHeader
        id={headingId}
        level="Jira ticket"
        icon="ticket"
        title={ticketKey}
      />
      <DeliveryState status={status} jiraConnected={jiraConnected}>
        <JiraNotices metrics={delivery.metrics} canAdminister={canAdminister} />
        {!row ? (
          <PanelState
            state="empty"
            icon="ticket"
            emptyMessage={`We have no details for ticket ${ticketKey}. Only tickets linked to this project's pull requests, and their parent stories, are fetched from Jira.`}
          />
        ) : (
          <>
            <SummaryList
              rows={[
                { key: 'Summary', value: row.summary || '–' },
                { key: 'Type', value: row.type || '–' },
                { key: 'Status', value: <JiraStatusTag status={row.status} /> },
                {
                  key: 'Story points',
                  value: row.storyPoints ?? '–'
                },
                { key: 'Created', value: formatDate(row.created) },
                { key: 'Lead time', value: days(row.leadDays) },
                { key: 'Cycle time', value: days(row.cycleDays) },
                { key: 'Reopened', value: plural(row.reopenCount, 'time') }
              ]}
            />
            {row.links.length > 0 && (
              <Panel title="Linked issues" family="leverage" icon="ticket">
                <ul className="govuk-list">
                  {row.links.map((l) => (
                    <li key={`${l.type}-${l.key}`}>
                      {l.type && <span className="app-muted">{l.type} </span>}
                      {onOpenTicket ? (
                        <OpenButton onClick={() => onOpenTicket(l.key)}>
                          {l.key}
                        </OpenButton>
                      ) : (
                        l.key
                      )}
                      {l.issueType && ` (${l.issueType})`}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {row.history.length > 0 && (
              <Panel title="Status history" family="speed" icon="clock">
                <table className="govuk-table govuk-!-margin-bottom-0">
                  <caption className="govuk-visually-hidden">
                    Status changes for {row.key}
                  </caption>
                  <thead className="govuk-table__head">
                    <tr className="govuk-table__row">
                      <th scope="col" className="govuk-table__header">
                        When
                      </th>
                      <th scope="col" className="govuk-table__header">
                        From
                      </th>
                      <th scope="col" className="govuk-table__header">
                        To
                      </th>
                    </tr>
                  </thead>
                  <tbody className="govuk-table__body">
                    {row.history.map((h) => (
                      <tr key={`${h.at}-${h.to}`} className="govuk-table__row">
                        <td className="govuk-table__cell">
                          {formatDateTime(h.at)}
                        </td>
                        <td className="govuk-table__cell">{h.from || '–'}</td>
                        <td className="govuk-table__cell">{h.to || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
            <Panel title="Linked pull requests" family="leverage" icon="merge">
              {row.prs.length === 0 ? (
                <PanelState
                  state="empty"
                  emptyMessage="No pull request in this period mentions this ticket."
                />
              ) : (
                <ul className="govuk-list">
                  {row.prs.map((pr) => (
                    <li key={`${pr.repository}#${pr.prNumber}`}>
                      <OpenButton
                        onClick={() => onOpenPR(pr.repository, pr.prNumber)}
                      >
                        {prLabel(pr)}
                      </OpenButton>{' '}
                      {pr.title}{' '}
                      <Tag colour={pr.merged ? 'green' : 'grey'}>
                        {pr.merged ? 'Merged' : 'Open'}
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </DeliveryState>
    </section>
  )
}
