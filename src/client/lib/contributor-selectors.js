import {
  computePrMetrics,
  countedCommits,
  payloadActivityTime,
  rate,
  shortRepoName
} from './selector-core.js'

const CONTRIBUTOR_SUMS = [
  'totalCommits',
  'copilotAssisted',
  'humanAuthored',
  'linesAdded',
  'linesDeleted',
  'linesTouched',
  'netLines',
  'copilotAssistedLines',
  'humanAuthoredLines'
]

const emptySummary = (contributor) => ({
  contributor,
  ...Object.fromEntries(CONTRIBUTOR_SUMS.map((k) => [k, 0])),
  repos: new Set(),
  prs: new Set()
})

/**
 * Contributors aggregated across every repo (for the contributor view).
 * Grouped from each PR's per-commit `computePrMetrics` breakdown (not the
 * upstream `contributorBreakdown`) so Rebase commits are excluded.
 */
export function selectContributorSummaries(payloads) {
  const byContributor = new Map()

  for (const p of payloads) {
    for (const [contributor, c] of computePrMetrics(p).byContributor) {
      const agg = byContributor.get(contributor) ?? emptySummary(contributor)
      byContributor.set(contributor, agg)
      for (const key of CONTRIBUTOR_SUMS) {
        agg[key] += c[key]
      }
      if (c.totalCommits > 0) {
        agg.repos.add(p.repository)
        agg.prs.add(`${p.repository}#${p.prNumber}`)
      }
    }
  }

  return Array.from(byContributor.values())
    .filter((c) => c.totalCommits > 0)
    .map(({ repos, prs, ...c }) => ({
      ...c,
      repoCount: repos.size,
      prCount: prs.size,
      copilotAssistedRate: rate(c.copilotAssisted, c.totalCommits),
      copilotAssistedLineRate: rate(c.copilotAssistedLines, c.linesTouched)
    }))
    .sort((a, b) => b.copilotAssistedRate - a.copilotAssistedRate)
}

/**
 * Every counted commit across all payloads, tagged with repo + PR context
 * and its effective classification.
 */
export function selectAllCommits(payloads) {
  return payloads.flatMap((p) =>
    countedCommits(p).map(({ c, category }) => ({
      ...c,
      classification: category,
      repository: p.repository,
      repoName: shortRepoName(p.repository),
      prNumber: p.prNumber
    }))
  )
}

/** All PRs (with context) a single contributor took part in (Rebase excluded). */
export function selectContributorPRs(payloads, contributor) {
  return payloads
    .map((p) => ({
      p,
      mine: computePrMetrics(p).byContributor.get(contributor)
    }))
    .filter(({ mine }) => mine?.totalCommits > 0)
    .map(({ p, mine }) => ({
      repository: p.repository,
      repoName: shortRepoName(p.repository),
      prNumber: p.prNumber,
      calculatedAt: p.calculatedAt,
      activityAt: payloadActivityTime(p),
      ...mine,
      copilotAssistedRate: rate(mine.copilotAssisted, mine.totalCommits),
      commits: countedCommits(p)
        .filter(({ c }) => c.author === contributor)
        .map(({ c, category }) => ({ ...c, classification: category }))
    }))
    .sort((a, b) => b.activityAt - a.activityAt)
}

/** Matrix of assist-rate by contributor × repo for the heatmap (Rebase excluded). */
export function selectContributorRepoMatrix(payloads) {
  const contributors = new Set()
  const repos = new Set()
  const cell = new Map()

  for (const p of payloads) {
    repos.add(p.repository)
    for (const [contributor, c] of computePrMetrics(p).byContributor) {
      if (c.totalCommits > 0) {
        contributors.add(contributor)
        const key = `${contributor}|${p.repository}`
        const e = cell.get(key) ?? { assisted: 0, total: 0 }
        e.assisted += c.copilotAssisted
        e.total += c.totalCommits
        cell.set(key, e)
      }
    }
  }

  const contributorList = Array.from(contributors)
  const repoList = Array.from(repos)
  const data = repoList.flatMap((repo, x) =>
    contributorList.map((contributor, y) => {
      const e = cell.get(`${contributor}|${repo}`)
      return [x, y, e ? rate(e.assisted, e.total) : null]
    })
  )

  return {
    contributors: contributorList,
    repos: repoList.map(shortRepoName),
    data
  }
}
