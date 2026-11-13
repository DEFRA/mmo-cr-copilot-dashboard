import {
  avgCommitSize,
  computePrMetrics,
  hoursBetween,
  isMergedPayload,
  isValidDateStr,
  mean,
  median,
  payloadActivityTime,
  round,
  selectRepoPRs,
  shortRepoName
} from './selector-core.js'

/** Per-PR delivery metrics: cycle time, time-to-merge, batch size, rework (Rebase excluded). */
export function selectDeliveryMetrics(payloads) {
  return payloads
    .map((p) => {
      const m = computePrMetrics(p)
      return {
        repository: p.repository,
        repoName: shortRepoName(p.repository),
        prNumber: p.prNumber,
        date: new Date(payloadActivityTime(p)).toISOString(),
        cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt),
        timeToMergeHours: hoursBetween(p.prCreatedAt, p.prMergedAt),
        // Completed once it has a valid merge timestamp; otherwise in progress.
        completed: isValidDateStr(p.prMergedAt),
        prMergedAt: p.prMergedAt ?? null,
        avgCommitSize: avgCommitSize(m),
        reworkRatio: m.reworkRatio,
        linesAdded: m.linesAdded,
        linesDeleted: m.linesDeleted,
        netLines: m.netLines,
        rebaseCommits: m.rebaseCommits,
        rebaseLines: m.rebaseLines,
        copilotAssistedRate: m.copilotAssistedRate
      }
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

const extremes = (cycles) => ({
  fastest: cycles.length ? Math.min(...cycles) : 0,
  slowest: cycles.length ? Math.max(...cycles) : 0
})

/** Average, fastest and slowest PR coding cycle time per repository, fastest first. */
export function selectRepoCycleTimes(payloads) {
  const byRepo = new Map()
  for (const m of selectDeliveryMetrics(payloads)) {
    const r = byRepo.get(m.repository) ?? {
      repository: m.repository,
      name: m.repoName,
      cycles: [],
      prCount: 0
    }
    byRepo.set(m.repository, r)
    if (m.cycleHours > 0) {
      r.cycles.push(m.cycleHours)
    }
    r.prCount += 1
  }
  return Array.from(byRepo.values())
    .map(({ cycles, ...r }) => ({
      ...r,
      avgCycleHours: mean(cycles),
      ...extremes(cycles)
    }))
    .sort((a, b) => a.avgCycleHours - b.avgCycleHours)
}

/**
 * One cycle-time point per pull request in a repository, plotted at its merge
 * date (or last activity); PRs without a usable timestamp are skipped.
 */
export function selectRepoCyclePoints(payloads, repository) {
  return selectRepoPRs(payloads, repository)
    .map((pr) => {
      const m = computePrMetrics(pr)
      const mergedAt = new Date(
        pr.prMergedAt ?? pr.lastCommitAt ?? pr.calculatedAt
      ).getTime()
      if (!Number.isFinite(mergedAt)) {
        return null
      }
      return {
        prNumber: pr.prNumber,
        mergedAt,
        merged: isMergedPayload(pr),
        cycleHours: hoursBetween(pr.firstCommitAt, pr.lastCommitAt),
        timeToMergeHours: hoursBetween(pr.prCreatedAt, pr.prMergedAt),
        batchSize: avgCommitSize(m),
        assistRate: m.copilotAssistedRate,
        linesAdded: m.linesAdded,
        linesDeleted: m.linesDeleted,
        contributors: Array.from(m.byContributor.keys())
      }
    })
    .filter(Boolean)
}

/** Average, median, fastest and slowest PR coding cycle time of a set of points. */
export function selectCycleTimeStats(points) {
  const cycles = points.map((p) => p.cycleHours).filter((h) => h > 0)
  return {
    avg: round(mean(cycles), 1),
    median: median(cycles),
    ...extremes(cycles),
    measured: cycles.length,
    prCount: points.length
  }
}

const reworkOf = (deleted, added) => (added ? round(deleted / added, 2) : 0)

/**
 * Rework Ratio (deleted ÷ added lines, Rebase excluded), computed per
 * repository first and then aggregated into one portfolio KPI — the
 * portfolio figure is weighted by each repo's lines-added so a large repo's
 * churn isn't diluted by averaging it equally against a tiny one.
 */
export function selectRepoRework(payloads) {
  const byRepo = new Map()
  for (const p of payloads) {
    const m = computePrMetrics(p)
    const r = byRepo.get(p.repository) ?? {
      repository: p.repository,
      name: shortRepoName(p.repository),
      linesAdded: 0,
      linesDeleted: 0,
      prCount: 0,
      rebaseCommits: 0,
      rebaseLines: 0
    }
    byRepo.set(p.repository, r)
    r.linesAdded += m.linesAdded
    r.linesDeleted += m.linesDeleted
    r.prCount += 1
    r.rebaseCommits += m.rebaseCommits
    r.rebaseLines += m.rebaseLines
  }

  const repos = Array.from(byRepo.values())
    .map((r) => ({
      ...r,
      netLines: r.linesAdded - r.linesDeleted,
      reworkRatio: reworkOf(r.linesDeleted, r.linesAdded)
    }))
    .sort((a, b) => b.reworkRatio - a.reworkRatio)

  const totalAdded = repos.reduce((s, r) => s + r.linesAdded, 0)
  const totalDeleted = repos.reduce((s, r) => s + r.linesDeleted, 0)

  return {
    repos,
    totalAdded,
    totalDeleted,
    portfolioReworkRatio: reworkOf(totalDeleted, totalAdded)
  }
}
