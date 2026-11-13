import {
  hoursBetween,
  isFiniteNum,
  isMergedPayload,
  round,
  shortRepoName
} from './selector-core.js'

const DAY_MS = 24 * 60 * 60 * 1000

const prSummary = (p) => ({
  repository: p.repository,
  prNumber: p.prNumber,
  title: p.prTitle ?? '',
  merged: isMergedPayload(p)
})

/** Pull requests per Jira key, from the payloads' `jiraKeys`. */
export function selectPrsByTicket(payloads) {
  const byKey = new Map()
  for (const p of payloads ?? []) {
    const keys = Array.isArray(p?.jiraKeys) ? p.jiraKeys : []
    for (const key of keys.filter((k) => typeof k === 'string')) {
      const list = byKey.get(key) ?? []
      list.push(prSummary(p))
      byKey.set(key, list)
    }
  }
  return byKey
}

// Workflow stage kinds as the Jira status categories the ticket views group by.
const STAGE_CATEGORY = {
  todo: 'new',
  active: 'indeterminate',
  waiting: 'indeterminate',
  done: 'done'
}

const finiteOrNull = (n) => (isFiniteNum(n) ? n : null)
const timeOrNull = (value) => {
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}
const daysBetween = (from, to) =>
  from !== null && to !== null
    ? round(Math.max(0, to - from) / DAY_MS, 1)
    : null

/** Timings from the backend's per-issue workflow `flow`. */
function flowTimings(issue, flow) {
  return {
    created: timeOrNull(issue.created),
    category: STAGE_CATEGORY[flow.stageKind] ?? issue.status?.categoryKey ?? '',
    stageKind: typeof flow.stageKind === 'string' ? flow.stageKind : null,
    started: timeOrNull(flow.startedAt),
    resolved: timeOrNull(flow.doneAt),
    firstDone: timeOrNull(flow.firstDoneAt),
    cycleDays: finiteOrNull(flow.cycleDays),
    leadDays: finiteOrNull(flow.leadDays),
    flowEfficiency: finiteOrNull(flow.flowEfficiency),
    reopenCount: Number(flow.reopenCount) || 0
  }
}

/** Timings from Jira's own started and resolved fields. */
function jiraTimings(issue) {
  const created = timeOrNull(issue.created)
  const started = timeOrNull(issue.started ?? issue.created)
  const resolved = timeOrNull(issue.resolved)
  return {
    created,
    category: issue.status?.categoryKey ?? '',
    stageKind: null,
    started,
    resolved,
    firstDone: timeOrNull(issue.firstDoneAt) ?? resolved,
    cycleDays: daysBetween(started, resolved),
    leadDays: daysBetween(created, resolved),
    flowEfficiency: null,
    reopenCount: Number(issue.reopenCount) || 0
  }
}

/** A ticket's start, end and timings from the backend `flow`, else from Jira fields. */
const ticketTimings = (issue) =>
  issue.flow && typeof issue.flow === 'object'
    ? flowTimings(issue, issue.flow)
    : jiraTimings(issue)

const storyPointsOf = (issue) => {
  const points = Number(issue.storyPoints)
  return Number.isFinite(points) ? points : null
}

const linksOf = (issue) =>
  (Array.isArray(issue.issueLinks) ? issue.issueLinks : [])
    .filter((l) => typeof l?.key === 'string')
    .map((l) => ({
      key: l.key,
      type: l.type ?? '',
      issueType: l.issueType ?? ''
    }))

const historyOf = (issue) =>
  (Array.isArray(issue.statusHistory) ? issue.statusHistory : [])
    .filter((h) => Number.isFinite(Date.parse(h?.at)))
    .map((h) => ({ at: Date.parse(h.at), from: h.from ?? '', to: h.to ?? '' }))

/**
 * Ticket table rows. With the backend's per-issue `flow` the workflow stages
 * set start, Done and cycle time; without it, Jira's started and resolved do.
 */
export function selectTicketRows(issues, payloads) {
  const prs = selectPrsByTicket(payloads)
  return (issues ?? [])
    .filter((issue) => typeof issue?.key === 'string')
    .map((issue) => ({
      key: issue.key,
      summary: issue.summary ?? '',
      type: issue.issueType ?? '',
      status: issue.status?.name ?? '',
      storyPoints: storyPointsOf(issue),
      ...ticketTimings(issue),
      links: linksOf(issue),
      history: historyOf(issue),
      prs: prs.get(issue.key) ?? []
    }))
}

const finiteValue = (v) => (Number.isFinite(v) ? v : null)

/**
 * Per-sprint delivery points, oldest first, from newest-first sprints and the
 * matching delivery-metrics responses. Missing or failed sprints read as null.
 */
export function selectDeliveryTrend(results, sprints) {
  return (sprints ?? [])
    .map((sprint, i) => {
      const m = results?.[i] ?? {}
      return {
        label: sprint.label ?? `Sprint ${sprint.index ?? i + 1}`,
        delivered: finiteValue(m.storiesDelivered),
        predictability: finiteValue(m.sprintPredictability),
        changeFailRate: finiteValue(m.changeFailRate),
        changeLeadTimeDays: finiteValue(m.changeLeadTimeDays)
      }
    })
    .reverse()
}

/** Tickets that reached Done inside the window, the set delivery metrics count. */
export function selectDoneTickets(rows, start, end) {
  const from = start ? new Date(start).getTime() : -Infinity
  const to = end ? new Date(end).getTime() : Infinity
  return rows.filter(
    (row) =>
      row.category === 'done' &&
      row.resolved !== null &&
      row.resolved >= from &&
      row.resolved < to
  )
}

export const FUNNEL_STAGES = ['To do', 'In progress', 'PR merged', 'Done']
const [TO_DO, IN_PROGRESS, PR_MERGED, DONE] = FUNNEL_STAGES.keys()

function funnelStage(row) {
  if (row.category === 'done') {
    return DONE
  }
  if (row.prs.length > 0 && row.prs.every((pr) => pr.merged)) {
    return PR_MERGED
  }
  return row.category === 'indeterminate' ? IN_PROGRESS : TO_DO
}

/**
 * Where each ticket sits: Jira's status category, with an in-progress ticket
 * whose linked PRs are all merged counted as "PR merged".
 */
export function selectTicketFunnel(rows) {
  const counts = FUNNEL_STAGES.map(() => 0)
  for (const row of rows) {
    counts[funnelStage(row)] += 1
  }
  return counts
}

export const COMPLEXITY_BANDS = ['XS', 'S', 'M', 'L', 'XL']

const medianOf = (values) => {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (nums.length === 0) {
    return null
  }
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

function nativeRepoRow(repository, prs) {
  const cycles = prs
    .map((p) => hoursBetween(p.firstCommitAt, p.lastCommitAt))
    .filter((h) => h > 0)
  const complexity = medianOf(prs.map((p) => Number(p.complexity?.score)))
  const cycle = medianOf(cycles)
  return {
    repository,
    name: shortRepoName(repository),
    prCount: prs.length,
    merged: prs.filter(isMergedPayload).length,
    medianComplexity: complexity === null ? null : Math.round(complexity),
    medianCycleHours: cycle === null ? null : round(cycle, 1)
  }
}

/** Per-repository delivery comparison with no adoption measures (AI-Native). */
export function selectNativeRepoComparison(payloads) {
  const byRepo = new Map()
  for (const p of (payloads ?? []).filter((pr) => pr?.repository)) {
    const list = byRepo.get(p.repository) ?? []
    list.push(p)
    byRepo.set(p.repository, list)
  }
  return [...byRepo.entries()]
    .map(([repository, prs]) => nativeRepoRow(repository, prs))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Leverage v2 band rows in band order; a band without data reads as empty. */
export function selectLeverageBands(leverage) {
  const bands = leverage?.bandComparison ?? {}
  return COMPLEXITY_BANDS.map((band) => {
    const b = bands[band] ?? {}
    return {
      band,
      baselineCount: Number(b.baselineCount) || 0,
      adoptedCount: Number(b.adoptedCount) || 0,
      baselineHours: round(Number(b.baselineMedianCycleHours) || 0, 1),
      adoptedHours: round(Number(b.adoptedMedianCycleHours) || 0, 1),
      speedup: Number(b.speedup) || 0,
      comparable: b.comparable === true
    }
  })
}
