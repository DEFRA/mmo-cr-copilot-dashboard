/**
 * Pure selectors that transform the raw payload array into the aggregated
 * shapes each dashboard view needs. Repository selectors live here; the rest
 * are re-exported from their topic modules so views import from one place.
 */
import { COPILOT_ASSISTED } from './classification'
import {
  COPILOT_LED_THRESHOLD,
  avgCommitSize,
  byActivityAsc,
  computePrMetrics,
  countedCommits,
  hoursBetween,
  isMergedPayload,
  payloadActivityTime,
  rate,
  round,
  selectRepoPRs,
  shortRepoName
} from './selector-core.js'

export {
  classificationLabel,
  computePrMetrics,
  effectiveClassification,
  filterPayloadsByWindow,
  formatDuration,
  hoursBetween,
  isMergedPayload,
  isPlottableCommit,
  isPlottablePayload,
  payloadActivityTime,
  rate,
  round,
  selectRepoPRs,
  shortRepoName
} from './selector-core.js'
export * from './contributor-selectors.js'
export * from './cycle-selectors.js'
export * from './leverage-selectors.js'
export * from './profile-selectors.js'
export * from './ticket-selectors.js'
export * from './usage-selectors.js'

const SUMMED = [
  'totalCommits',
  'copilotAssistedCommits',
  'humanAuthoredCommits',
  'rebaseCommits',
  'totalLinesTouched',
  'copilotAssistedLines',
  'humanAuthoredLines',
  'rebaseLines'
]

const zeroed = () => Object.fromEntries(SUMMED.map((k) => [k, 0]))

function addMetrics(acc, m) {
  for (const key of SUMMED) {
    acc[key] += m[key]
  }
  return acc
}

const withRates = (totals) => ({
  copilotAssistedRate: rate(totals.copilotAssistedCommits, totals.totalCommits),
  copilotAssistedLineRate: rate(
    totals.copilotAssistedLines,
    totals.totalLinesTouched
  )
})

/** Global totals across every PR/repo (Rebase commits excluded). */
export function selectGlobalSummary(payloads) {
  const metricsList = payloads.map(computePrMetrics)
  const acc = metricsList.reduce(addMetrics, zeroed())
  const repos = new Set(payloads.map((p) => p.repository))
  const contributors = new Set(
    metricsList.flatMap((m) => Array.from(m.byContributor.keys()))
  )

  return {
    ...acc,
    repoCount: repos.size,
    prCount: payloads.length,
    contributorCount: contributors.size,
    ...withRates(acc)
  }
}

/** One aggregated row per repository (Rebase commits excluded). */
export function selectRepoSummaries(payloads) {
  const byRepo = new Map()

  for (const p of payloads) {
    const r = byRepo.get(p.repository) ?? {
      repository: p.repository,
      name: shortRepoName(p.repository),
      prCount: 0,
      ...zeroed(),
      contributors: new Set()
    }
    byRepo.set(p.repository, r)
    const m = computePrMetrics(p)
    r.prCount += 1
    addMetrics(r, m)
    for (const author of m.byContributor.keys()) {
      r.contributors.add(author)
    }
  }

  return Array.from(byRepo.values())
    .map(({ contributors, ...r }) => ({
      ...r,
      contributorCount: contributors.size,
      ...withRates(r),
      avgCommitSize: avgCommitSize(r)
    }))
    .sort((a, b) => b.copilotAssistedRate - a.copilotAssistedRate)
}

const jiraKeysOf = (p) =>
  Array.isArray(p.jiraKeys)
    ? p.jiraKeys.filter((k) => typeof k === 'string')
    : []

/** One row per pull request in a repository, newest first (Rebase excluded). */
export function selectRepoPrRows(payloads, repository) {
  return selectRepoPRs(payloads, repository).map((p) => {
    const m = computePrMetrics(p)
    const contributors = Array.from(m.byContributor.values())
    return {
      prNumber: p.prNumber,
      title: typeof p.prTitle === 'string' ? p.prTitle : null,
      merged: isMergedPayload(p),
      contributors: contributors.map((c) => c.contributor),
      adopters: contributors.filter((c) => c.copilotAssisted > 0).length,
      totalCommits: m.totalCommits,
      copilotAssistedCommits: m.copilotAssistedCommits,
      humanAuthoredCommits: m.humanAuthoredCommits,
      totalLinesTouched: m.totalLinesTouched,
      copilotAssistedLines: m.copilotAssistedLines,
      humanAuthoredLines: m.humanAuthoredLines,
      copilotAssistedRate: m.copilotAssistedRate,
      copilotAssistedLineRate: m.copilotAssistedLineRate,
      copilotLed: m.copilotAssistedRate >= COPILOT_LED_THRESHOLD,
      linesAdded: m.linesAdded,
      linesDeleted: m.linesDeleted,
      netLines: m.netLines,
      reworkRatio: m.reworkRatio,
      avgCommitSize: avgCommitSize(m),
      cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt),
      jiraKeys: jiraKeysOf(p)
    }
  })
}

/** Per-PR averages for a repository: mean commit assist rate and PRs that used Copilot. */
export function selectPrAverages(rows) {
  if (rows.length === 0) {
    return { avgAssistRate: 0, copilotPrCount: 0 }
  }
  const sum = rows.reduce((s, r) => s + r.copilotAssistedRate, 0)
  return {
    avgAssistRate: round(sum / rows.length),
    copilotPrCount: rows.filter((r) => r.copilotAssistedCommits > 0).length
  }
}

/** Commit assist rate per contributor within one repository, highest first. */
export function selectRepoContributors(payloads, repository) {
  const byContributor = new Map()
  for (const p of payloads.filter((pr) => pr.repository === repository)) {
    for (const [contributor, c] of computePrMetrics(p).byContributor) {
      const e = byContributor.get(contributor) ?? {
        contributor,
        assisted: 0,
        total: 0
      }
      e.assisted += c.copilotAssisted
      e.total += c.totalCommits
      byContributor.set(contributor, e)
    }
  }
  return Array.from(byContributor.values())
    .map((c) => ({ ...c, rate: rate(c.assisted, c.total) }))
    .sort((a, b) => b.rate - a.rate)
}

/** Counted commits as lines-added against lines-deleted points (excluded commits left out). */
export function selectCommitHotspots(payloads) {
  return payloads.flatMap((p) =>
    countedCommits(p).map(({ c, category }) => ({
      x: c.linesAdded,
      y: c.linesDeleted,
      size: c.linesTouched,
      category,
      label: `#${p.prNumber} ${c.commit}`
    }))
  )
}

/** One pull request's counted commits, oldest first, with lines split by classification. */
export function selectPrCommitLines(payload) {
  return countedCommits(payload)
    .sort((a, b) => Date.parse(a.c.committedAt) - Date.parse(b.c.committedAt))
    .map(({ c, category }) => {
      const copilot = category === COPILOT_ASSISTED
      return {
        commit: c.commit,
        subject: c.subject ?? '',
        category,
        added: c.linesAdded,
        deleted: c.linesDeleted,
        touched: c.linesTouched,
        copilot: copilot ? c.linesTouched : 0,
        human: copilot ? 0 : c.linesTouched
      }
    })
}

/** Assist-rate timeline (per PR, chronological) for the trend chart. */
export function selectAssistTrend(payloads) {
  return payloads
    .slice()
    .sort(byActivityAsc)
    .map((p) => {
      const m = computePrMetrics(p)
      return {
        label: `${shortRepoName(p.repository)} #${p.prNumber}`,
        date: new Date(payloadActivityTime(p)).toISOString(),
        repository: p.repository,
        prNumber: p.prNumber,
        commitRate: m.copilotAssistedRate,
        lineRate: m.copilotAssistedLineRate
      }
    })
}
