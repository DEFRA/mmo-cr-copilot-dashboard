import { shortRepoName } from '../../lib/selectors'
import { plural } from './scope.jsx'

const value = (n) => (n === null || n === undefined ? '–' : String(n))
const days = (n) => (n === null || n === undefined ? '–' : `${n} days`)
const prLabel = (pr) => `${shortRepoName(pr.repository)} #${pr.prNumber}`
const isBug = (row) => /bug|defect/i.test(row.type)

/**
 * Delivery KPI cards keyed by id, from the backend delivery metrics and the
 * ticket rows Done in the window. Views pick the ids they show.
 */
export function buildDeliveryKpis({
  metrics,
  done,
  unlinked = [],
  inProgress = [],
  onOpenTicket,
  onOpenPR
}) {
  const tickets = (list, describe) =>
    list.map((row) => ({
      key: row.key,
      name: row.key,
      value: describe(row),
      sub: row.summary,
      onOpen: () => onOpenTicket(row.key)
    }))
  const delivered = {
    title: 'Tickets delivered in the period',
    hint: ' ticket',
    items: tickets(done, (r) => days(r.cycleDays))
  }
  const failed = new Set(metrics.failedTickets ?? [])

  return {
    changeLead: {
      id: 'change-lead',
      label: 'Change lead time',
      anchor: 'metric-change-lead-time',
      family: 'speed',
      icon: 'flow',
      value: value(metrics.changeLeadTimeDays),
      unit: metrics.changeLeadTimeDays === null ? undefined : ' days',
      sub: 'Median, first commit to Done',
      drill: delivered
    },
    frequency: {
      id: 'frequency',
      label: 'Delivery frequency',
      anchor: 'metric-delivery-frequency',
      family: 'output',
      icon: 'ticket',
      value: value(metrics.deliveryFrequencyPerWeek),
      sub: 'Tickets Done per week',
      drill: delivered
    },
    defectRecovery: {
      id: 'defect-recovery',
      label: 'Defect recovery time',
      anchor: 'metric-defect-recovery-time',
      family: 'speed',
      icon: 'clock',
      value: value(metrics.defectRecoveryTimeDays),
      unit: metrics.defectRecoveryTimeDays === null ? undefined : ' days',
      sub:
        metrics.defectRecoveryTimeDays === null
          ? 'No bugs delivered in the period'
          : 'Median, bug created to Done',
      drill: {
        title: 'Bugs delivered in the period',
        hint: ' ticket',
        items: tickets(done.filter(isBug), (r) => days(r.cycleDays))
      }
    },
    changeFail: {
      id: 'change-fail',
      label: 'Change fail rate',
      anchor: 'metric-change-fail-rate',
      family: 'risk',
      icon: 'bug',
      value: value(metrics.changeFailRate),
      unit: '%',
      sub: `${failed.size} of ${done.length} reopened or followed by a bug`,
      drill: {
        title: 'Delivered tickets that failed',
        hint: ' ticket',
        items: tickets(
          done.filter((r) => failed.has(r.key)),
          (r) =>
            r.reopenCount > 0 ? plural(r.reopenCount, 'reopen') : 'Bug linked'
        )
      }
    },
    rework: {
      id: 'rework',
      label: 'Delivery rework rate',
      anchor: 'metric-delivery-rework-rate',
      family: 'quality',
      icon: 'rework',
      value: value(metrics.deliveryReworkRate),
      unit: '%',
      sub: `${done.filter(isBug).length} of ${done.length} were bugs or fixes`,
      drill: {
        title: 'Bugs and fixes delivered',
        hint: ' ticket',
        items: tickets(done.filter(isBug), (r) => r.type)
      }
    },
    cycle: {
      id: 'cycle',
      label: 'Ticket cycle time',
      anchor: 'metric-ticket-cycle-time',
      family: 'speed',
      icon: 'clock',
      value: value(metrics.cycleTimeDays),
      unit: ' days',
      sub: 'Median, In Progress to Done',
      drill: {
        title: 'Cycle time by ticket',
        hint: ' ticket',
        items: tickets(
          [...done].sort((a, b) => (b.cycleDays ?? 0) - (a.cycleDays ?? 0)),
          (r) => days(r.cycleDays)
        )
      }
    },
    throughput: {
      id: 'throughput',
      label: 'Throughput',
      anchor: 'metric-throughput',
      family: 'output',
      icon: 'ticket',
      value: value(metrics.storiesDelivered),
      sub: 'Tickets moved to Done',
      drill: delivered
    },
    flow: {
      id: 'flow',
      label: 'Flow efficiency',
      anchor: 'metric-flow-efficiency',
      family: 'leverage',
      icon: 'flow',
      value: value(metrics.flowEfficiency),
      unit: metrics.flowEfficiency === null ? undefined : '%',
      sub: 'Active time ÷ ticket cycle time',
      drill: delivered
    },
    predictability: {
      id: 'predictability',
      label: 'Sprint predictability',
      anchor: 'metric-sprint-predictability',
      family: 'leverage',
      icon: 'target',
      value: value(metrics.sprintPredictability),
      unit: metrics.sprintPredictability === null ? undefined : '%',
      sub:
        metrics.sprintPredictability === null
          ? 'No sprint ended in the period'
          : 'Committed tickets Done by sprint end',
      drill: {
        title: 'Sprints ending in the period',
        hint: ' sprint',
        items: (metrics.sprints ?? []).map((s) => ({
          key: s.name,
          name: s.name,
          value: `${s.predictability}%`,
          sub: `${s.done} of ${s.committed} committed tickets Done`,
          pct: s.predictability
        }))
      }
    },
    reopen: {
      id: 'reopen',
      label: 'Ticket reopen rate',
      anchor: 'metric-ticket-reopen-rate',
      family: 'quality',
      icon: 'rework',
      value: value(metrics.reopenRate),
      unit: '%',
      sub: 'Delivered tickets reopened at least once',
      drill: {
        title: 'Reopened tickets',
        hint: ' ticket',
        items: tickets(
          done.filter((r) => r.reopenCount > 0),
          (r) => plural(r.reopenCount, 'reopen')
        )
      }
    },
    sdu: {
      id: 'sdu',
      label: 'Standard deployable units',
      anchor: 'metric-standard-deployable-units',
      family: 'quality',
      icon: 'check',
      value: value(metrics.standardDeployableUnits),
      sub: 'Delivered tickets whose PRs passed the quality gate',
      drill: delivered
    },
    unlinked: {
      id: 'unlinked',
      label: 'Unlinked PR rate',
      anchor: 'metric-unlinked-pr-rate',
      family: 'risk',
      icon: 'merge',
      value: value(metrics.unlinkedPrRate),
      unit: '%',
      sub: 'Pull requests with no Jira key',
      drill: {
        title: 'Pull requests with no Jira key',
        hint: ' pull request',
        items: unlinked.map((p) => ({
          key: `${p.repository}#${p.prNumber}`,
          name: prLabel(p),
          value: p.prTitle ?? '',
          onOpen: () => onOpenPR(p.repository, p.prNumber)
        }))
      }
    },
    prCycle: {
      id: 'pr-cycle',
      label: 'PR cycle time',
      anchor: 'metric-pr-cycle-time',
      family: 'speed',
      icon: 'merge',
      value: value(metrics.prCycleTimeHours),
      unit: metrics.prCycleTimeHours === null ? undefined : 'h',
      sub: 'Median, PR opened to merged',
      drill: delivered
    },
    lead: {
      id: 'lead',
      label: 'Ticket lead time',
      anchor: 'metric-ticket-lead-time',
      family: 'speed',
      icon: 'clock',
      value: value(metrics.leadTimeToDoneDays),
      unit: ' days',
      sub: 'Median, created to Done',
      drill: {
        title: 'Lead time by ticket',
        hint: ' ticket',
        items: tickets(
          [...done].sort((a, b) => (b.leadDays ?? 0) - (a.leadDays ?? 0)),
          (r) => days(r.leadDays)
        )
      }
    },
    wip: {
      id: 'wip',
      label: 'Work in progress',
      anchor: 'metric-wip',
      family: 'output',
      icon: 'layers',
      value: value(metrics.workInProgress),
      sub: 'Tickets in progress now',
      drill: {
        title: 'Tickets in progress',
        hint: ' ticket',
        items: tickets(inProgress, (r) => r.status)
      }
    },
    prsPerTicket: {
      id: 'prs-per-ticket',
      label: 'PRs per ticket',
      anchor: 'metric-prs-per-ticket',
      family: 'output',
      icon: 'merge',
      value: value(metrics.prsPerTicket),
      sub: 'Merged PRs per delivered ticket',
      drill: {
        title: 'Pull requests per delivered ticket',
        hint: ' ticket',
        items: tickets(done, (r) => plural(r.prs.length, 'PR'))
      }
    },
    firstScan: {
      id: 'first-scan',
      label: 'First-scan pass rate',
      anchor: 'metric-first-scan-quality-pass-rate',
      family: 'quality',
      icon: 'shield',
      value: value(metrics.firstScanPassRate),
      unit: '%',
      sub: 'Passed the quality gate on the first scan',
      drill: delivered
    },
    qant: {
      id: 'qant',
      label: 'Quality-adjusted throughput',
      anchor: 'metric-quality-adjusted-net-throughput',
      family: 'leverage',
      icon: 'rocket',
      value: value(metrics.qant),
      unit: ' eLOC/day',
      sub: 'Quality-weighted net lines per cycle day',
      drill: delivered
    },
    vsp: {
      id: 'vsp',
      label: 'Story point velocity',
      anchor: 'metric-story-point-normalized-velocity',
      family: 'leverage',
      icon: 'target',
      value: value(metrics.storyPointVelocity),
      unit: ' eLOC/pt',
      sub: 'Quality-weighted net lines per story point',
      drill: delivered
    }
  }
}
