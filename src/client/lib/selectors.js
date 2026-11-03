/**
 * Pure selectors that transform the raw payload array into the aggregated
 * shapes each dashboard view needs. Kept framework-free so they are trivially
 * testable and reusable when the real feed replaces the mock data.
 */
import {
  REBASE_MERGE_REGEX,
  EXCLUDED_CLASSIFICATIONS,
  isExcludedClassification
} from './classification'
import { PERSONAS, personaForContributor } from './personas'

const round = (n, dp = 2) => {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

const rate = (part, whole) => (whole > 0 ? round((part / whole) * 100) : 0)

export function shortRepoName(repository) {
  const parts = repository.split('/')
  return parts[parts.length - 1]
}

/**
 * UI display label for a commit classification. The underlying data keeps the
 * canonical `'Non-flagged'` value; only the presentation reads 'Human-authored'.
 */
export function classificationLabel(classification) {
  return classification === 'Non-flagged' ? 'Human-authored' : classification
}

/**
 * Restricts payloads to a [start, end) time window. A PR is included when its
 * analysis time (`calculatedAt`, which runs across all its commits and so
 * tracks the latest commit) falls inside the window. Missing bounds are open.
 */
export function filterPayloadsByWindow(payloads, start, end) {
  if (start == null && end == null) return payloads
  const s = start != null ? new Date(start).getTime() : -Infinity
  const e = end != null ? new Date(end).getTime() : Infinity
  return payloads.filter((p) => {
    const stamp = p.calculatedAt ?? p.lastCommitAt ?? p.firstCommitAt
    if (!stamp) return true
    const t = new Date(stamp).getTime()
    return t >= s && t < e
  })
}

// ── Validation guards ────────────────────────────────────────────────────────
// The dashboard must never break on partial data. These guards let callers skip
// an incomplete commit or PR block instead of plotting NaN/undefined.

const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n)
const isValidDateStr = (s) =>
  typeof s === 'string' && !Number.isNaN(Date.parse(s))
/** Coerce to a finite number, else 0 — for defensive summing. */
const num = (n) => (isFiniteNum(n) ? n : 0)
/**
 * Classifications the charts understand. Excluded kinds are listed so they
 * survive this filter and can be reported as set aside; dropping them here
 * would leave them uncounted in either direction.
 */
const KNOWN_CLASSIFICATIONS = new Set([
  'Copilot-assisted',
  'Human-authored',
  ...EXCLUDED_CLASSIFICATIONS
])

/** True when a commit has every field the charts rely on. */
export function isPlottableCommit(c) {
  return (
    c != null &&
    typeof c.commit === 'string' &&
    c.commit.length > 0 &&
    isValidDateStr(c.committedAt) &&
    KNOWN_CLASSIFICATIONS.has(c.classification) &&
    isFiniteNum(c.linesAdded) &&
    isFiniteNum(c.linesDeleted) &&
    isFiniteNum(c.linesTouched)
  )
}

/**
 * True when a pull request has been merged. Gates the commit-log
 * classification editor: an open PR is re-analysed on every push, so a manual
 * correction there would be overwritten and would describe a commit set that
 * is still changing.
 */
export function isMergedPayload(p) {
  return isValidDateStr(p?.prMergedAt)
}

/** True when a PR payload has the summary + breakdown shape the charts need. */
export function isPlottablePayload(p) {
  return (
    p != null &&
    typeof p.repository === 'string' &&
    p.repository.length > 0 &&
    isFiniteNum(p.prNumber) &&
    p.summary != null &&
    isFiniteNum(p.summary.totalCommits) &&
    isFiniteNum(p.summary.copilotAssistedCommits) &&
    isFiniteNum(p.summary.humanAuthoredCommits) &&
    isFiniteNum(p.summary.copilotAssistedRate) &&
    isFiniteNum(p.summary.copilotAssistedLineRate) &&
    isFiniteNum(p.summary.totalLinesTouched) &&
    isFiniteNum(p.summary.copilotAssistedLines) &&
    isFiniteNum(p.summary.humanAuthoredLines) &&
    Array.isArray(p.contributorBreakdown) &&
    Array.isArray(p.commitBreakdown)
  )
}

const clamp01 = (n) => Math.max(0, Math.min(1, n))

/**
 * The classification actually used for every calculation on this dashboard.
 *
 * The producer classifies merge/rebase and Dependabot commits upstream, so
 * that verdict is taken as authoritative. Payloads stored before it did carry
 * sync merges as `Human-authored`, so a subject-pattern fallback still
 * re-classifies those as `'Rebase'` (see bug FI0-11445). Both excluded kinds
 * are left out of every rate, rework, leverage and net-lines calculation.
 */
export function effectiveClassification(commit) {
  if (isExcludedClassification(commit.classification)) {
    return commit.classification
  }
  if (REBASE_MERGE_REGEX.test((commit.subject ?? '').trim())) return 'Rebase'
  return classificationLabel(commit.classification)
}

/**
 * Single source of truth for one PR's metrics. Recomputes every total
 * directly from `commitBreakdown` — rather than trusting the upstream
 * `summary` / `contributorBreakdown` fields, which bake merge-commit lines
 * into 'Human-authored' — so Rebase commits can be excluded consistently
 * everywhere. Also returns a per-contributor breakdown (grouped by commit
 * `author`) for the same reason.
 */
export function computePrMetrics(payload) {
  const commits = (
    Array.isArray(payload.commitBreakdown) ? payload.commitBreakdown : []
  ).filter(isPlottableCommit)

  const m = {
    totalCommits: 0,
    copilotAssistedCommits: 0,
    humanAuthoredCommits: 0,
    rebaseCommits: 0,
    dependabotCommits: 0,
    totalLinesTouched: 0,
    copilotAssistedLines: 0,
    humanAuthoredLines: 0,
    rebaseLines: 0,
    dependabotLines: 0,
    linesAdded: 0,
    linesDeleted: 0,
    copilotLinesAdded: 0,
    copilotLinesDeleted: 0,
    humanLinesAdded: 0,
    humanLinesDeleted: 0
  }
  const byContributor = new Map()
  const countedCommits = []

  for (const c of commits) {
    const author = c.author ?? 'Unknown'
    const kind = effectiveClassification(c)

    // Rebase/merge and Dependabot commits are excluded from every metric.
    // Authors seen only on excluded commits are never registered.
    if (isExcludedClassification(kind)) {
      if (kind === 'Dependabot') {
        m.dependabotCommits += 1
        m.dependabotLines += num(c.linesTouched)
      } else {
        m.rebaseCommits += 1
        m.rebaseLines += num(c.linesTouched)
      }
      const prior = byContributor.get(author)
      if (prior) prior.rebase += 1
      continue
    }

    countedCommits.push(c)

    if (!byContributor.has(author)) {
      byContributor.set(author, {
        contributor: author,
        totalCommits: 0,
        copilotAssisted: 0,
        humanAuthored: 0,
        rebase: 0,
        linesAdded: 0,
        linesDeleted: 0,
        linesTouched: 0,
        netLines: 0,
        copilotAssistedLines: 0,
        humanAuthoredLines: 0
      })
    }
    const cAgg = byContributor.get(author)

    m.totalCommits += 1
    m.totalLinesTouched += num(c.linesTouched)
    m.linesAdded += num(c.linesAdded)
    m.linesDeleted += num(c.linesDeleted)
    cAgg.totalCommits += 1
    cAgg.linesAdded += num(c.linesAdded)
    cAgg.linesDeleted += num(c.linesDeleted)
    cAgg.linesTouched += num(c.linesTouched)
    cAgg.netLines += num(c.linesAdded) - num(c.linesDeleted)

    if (kind === 'Copilot-assisted') {
      m.copilotAssistedCommits += 1
      m.copilotAssistedLines += num(c.linesTouched)
      m.copilotLinesAdded += num(c.linesAdded)
      m.copilotLinesDeleted += num(c.linesDeleted)
      cAgg.copilotAssisted += 1
      cAgg.copilotAssistedLines += num(c.linesTouched)
    } else {
      m.humanAuthoredCommits += 1
      m.humanAuthoredLines += num(c.linesTouched)
      m.humanLinesAdded += num(c.linesAdded)
      m.humanLinesDeleted += num(c.linesDeleted)
      cAgg.humanAuthored += 1
      cAgg.humanAuthoredLines += num(c.linesTouched)
    }
  }

  let extensionAiLines = 0
  let extensionTotalLines = 0
  for (const c of countedCommits) {
    if (c.attribution?.source === 'extension') {
      const ai =
        (c.attribution.aiCompletionLines || 0) +
        (c.attribution.aiChatLines || 0) +
        (c.attribution.aiAgentLines || 0)
      const human =
        (c.attribution.pastedLines || 0) + (c.attribution.typedLines || 0)
      extensionAiLines += ai
      extensionTotalLines += ai + human
    }
  }
  const aiLineSharePercent =
    extensionTotalLines > 0
      ? Number(((extensionAiLines / extensionTotalLines) * 100).toFixed(2))
      : null

  return {
    repository: payload.repository,
    prNumber: payload.prNumber,
    ...m,
    netLines: m.linesAdded - m.linesDeleted,
    reworkRatio: m.linesAdded ? round(m.linesDeleted / m.linesAdded, 2) : 0,
    copilotAssistedRate: rate(m.copilotAssistedCommits, m.totalCommits),
    copilotAssistedLineRate: rate(m.copilotAssistedLines, m.totalLinesTouched),
    aiLineSharePercent,
    byContributor
  }
}

/** Global totals across every PR/repo (Rebase commits excluded). */
export function selectGlobalSummary(payloads) {
  const metricsList = payloads.map(computePrMetrics)
  const acc = metricsList.reduce(
    (a, m) => {
      a.totalCommits += m.totalCommits
      a.copilotAssistedCommits += m.copilotAssistedCommits
      a.humanAuthoredCommits += m.humanAuthoredCommits
      a.rebaseCommits += m.rebaseCommits
      a.totalLinesTouched += m.totalLinesTouched
      a.copilotAssistedLines += m.copilotAssistedLines
      a.humanAuthoredLines += m.humanAuthoredLines
      a.rebaseLines += m.rebaseLines
      return a
    },
    {
      totalCommits: 0,
      copilotAssistedCommits: 0,
      humanAuthoredCommits: 0,
      rebaseCommits: 0,
      totalLinesTouched: 0,
      copilotAssistedLines: 0,
      humanAuthoredLines: 0,
      rebaseLines: 0
    }
  )

  const repos = new Set(payloads.map((p) => p.repository))
  const contributors = new Set(
    metricsList.flatMap((m) => Array.from(m.byContributor.keys()))
  )

  return {
    ...acc,
    repoCount: repos.size,
    prCount: payloads.length,
    contributorCount: contributors.size,
    copilotAssistedRate: rate(acc.copilotAssistedCommits, acc.totalCommits),
    copilotAssistedLineRate: rate(
      acc.copilotAssistedLines,
      acc.totalLinesTouched
    )
  }
}

/** One aggregated row per repository (Rebase commits excluded). */
export function selectRepoSummaries(payloads) {
  const byRepo = new Map()

  for (const p of payloads) {
    const key = p.repository
    if (!byRepo.has(key)) {
      byRepo.set(key, {
        repository: key,
        name: shortRepoName(key),
        prCount: 0,
        totalCommits: 0,
        copilotAssistedCommits: 0,
        humanAuthoredCommits: 0,
        rebaseCommits: 0,
        totalLinesTouched: 0,
        copilotAssistedLines: 0,
        humanAuthoredLines: 0,
        rebaseLines: 0,
        contributors: new Set()
      })
    }
    const r = byRepo.get(key)
    const m = computePrMetrics(p)
    r.prCount += 1
    r.totalCommits += m.totalCommits
    r.copilotAssistedCommits += m.copilotAssistedCommits
    r.humanAuthoredCommits += m.humanAuthoredCommits
    r.rebaseCommits += m.rebaseCommits
    r.totalLinesTouched += m.totalLinesTouched
    r.copilotAssistedLines += m.copilotAssistedLines
    r.humanAuthoredLines += m.humanAuthoredLines
    r.rebaseLines += m.rebaseLines
    for (const author of m.byContributor.keys()) r.contributors.add(author)
  }

  return Array.from(byRepo.values())
    .map((r) => ({
      ...r,
      contributorCount: r.contributors.size,
      contributors: undefined,
      copilotAssistedRate: rate(r.copilotAssistedCommits, r.totalCommits),
      copilotAssistedLineRate: rate(
        r.copilotAssistedLines,
        r.totalLinesTouched
      ),
      avgCommitSize: r.totalCommits
        ? round(r.totalLinesTouched / r.totalCommits, 1)
        : 0
    }))
    .sort((a, b) => b.copilotAssistedRate - a.copilotAssistedRate)
}

/** PRs for a single repository, newest first. */
export function selectRepoPRs(payloads, repository) {
  return payloads
    .filter((p) => p.repository === repository)
    .slice()
    .sort((a, b) => new Date(b.calculatedAt) - new Date(a.calculatedAt))
}

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
      avgCommitSize: m.totalCommits
        ? round(m.totalLinesTouched / m.totalCommits, 1)
        : 0,
      cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt),
      jiraKeys: Array.isArray(p.jiraKeys)
        ? p.jiraKeys.filter((k) => typeof k === 'string')
        : []
    }
  })
}

/** Per-PR averages for a repository: mean commit assist rate and PRs that used Copilot. */
export function selectPrAverages(rows) {
  if (rows.length === 0) return { avgAssistRate: 0, copilotPrCount: 0 }
  const sum = rows.reduce((s, r) => s + r.copilotAssistedRate, 0)
  return {
    avgAssistRate: round(sum / rows.length),
    copilotPrCount: rows.filter((r) => r.copilotAssistedCommits > 0).length
  }
}

/** Commit assist rate per contributor within one repository, highest first. */
export function selectRepoContributors(payloads, repository) {
  const byContributor = new Map()
  for (const p of payloads) {
    if (p.repository !== repository) continue
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
    (Array.isArray(p.commitBreakdown) ? p.commitBreakdown : [])
      .filter(isPlottableCommit)
      .map((c) => ({ c, category: effectiveClassification(c) }))
      .filter(({ category }) => !isExcludedClassification(category))
      .map(({ c, category }) => ({
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
  return (
    Array.isArray(payload?.commitBreakdown) ? payload.commitBreakdown : []
  )
    .filter(isPlottableCommit)
    .map((c) => ({ c, category: effectiveClassification(c) }))
    .filter(({ category }) => !isExcludedClassification(category))
    .sort((a, b) => Date.parse(a.c.committedAt) - Date.parse(b.c.committedAt))
    .map(({ c, category }) => ({
      commit: c.commit,
      subject: c.subject ?? '',
      category,
      added: c.linesAdded,
      deleted: c.linesDeleted,
      touched: c.linesTouched,
      copilot: category === 'Copilot-assisted' ? c.linesTouched : 0,
      human: category === 'Copilot-assisted' ? 0 : c.linesTouched
    }))
}

/**
 * Contributors aggregated across every repo (for the contributor view).
 * Grouped from each PR's per-commit `computePrMetrics` breakdown (not the
 * upstream `contributorBreakdown`) so Rebase commits are excluded.
 */
export function selectContributorSummaries(payloads) {
  const byContributor = new Map()

  for (const p of payloads) {
    const m = computePrMetrics(p)
    for (const [contributor, c] of m.byContributor) {
      if (!byContributor.has(contributor)) {
        byContributor.set(contributor, {
          contributor,
          totalCommits: 0,
          copilotAssisted: 0,
          humanAuthored: 0,
          linesAdded: 0,
          linesDeleted: 0,
          linesTouched: 0,
          netLines: 0,
          copilotAssistedLines: 0,
          humanAuthoredLines: 0,
          repos: new Set(),
          prs: new Set()
        })
      }
      const agg = byContributor.get(contributor)
      agg.totalCommits += c.totalCommits
      agg.copilotAssisted += c.copilotAssisted
      agg.humanAuthored += c.humanAuthored
      agg.linesAdded += c.linesAdded
      agg.linesDeleted += c.linesDeleted
      agg.linesTouched += c.linesTouched
      agg.netLines += c.netLines
      agg.copilotAssistedLines += c.copilotAssistedLines
      agg.humanAuthoredLines += c.humanAuthoredLines
      if (c.totalCommits > 0) {
        agg.repos.add(p.repository)
        agg.prs.add(`${p.repository}#${p.prNumber}`)
      }
    }
  }

  return Array.from(byContributor.values())
    .filter((c) => c.totalCommits > 0)
    .map((c) => ({
      ...c,
      repoCount: c.repos.size,
      prCount: c.prs.size,
      repos: undefined,
      prs: undefined,
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
    (Array.isArray(p.commitBreakdown) ? p.commitBreakdown : [])
      .filter(isPlottableCommit)
      .map((c) => ({ ...c, classification: effectiveClassification(c) }))
      .filter((c) => !isExcludedClassification(c.classification))
      .map((c) => ({
        ...c,
        repository: p.repository,
        repoName: shortRepoName(p.repository),
        prNumber: p.prNumber
      }))
  )
}

/** All PRs (with context) a single contributor took part in (Rebase excluded). */
export function selectContributorPRs(payloads, contributor) {
  return payloads
    .map((p) => ({ p, m: computePrMetrics(p) }))
    .filter(
      ({ m }) =>
        m.byContributor.has(contributor) &&
        m.byContributor.get(contributor).totalCommits > 0
    )
    .map(({ p, m }) => {
      const mine = m.byContributor.get(contributor)
      const myCommits = (
        Array.isArray(p.commitBreakdown) ? p.commitBreakdown : []
      )
        .filter(isPlottableCommit)
        .filter((c) => c.author === contributor)
        .map((c) => ({ ...c, classification: effectiveClassification(c) }))
        .filter((c) => !isExcludedClassification(c.classification))
      return {
        repository: p.repository,
        repoName: shortRepoName(p.repository),
        prNumber: p.prNumber,
        calculatedAt: p.calculatedAt,
        ...mine,
        copilotAssistedRate: rate(mine.copilotAssisted, mine.totalCommits),
        commits: myCommits
      }
    })
    .sort((a, b) => new Date(b.calculatedAt) - new Date(a.calculatedAt))
}

/** Matrix of assist-rate by contributor × repo for the heatmap (Rebase excluded). */
export function selectContributorRepoMatrix(payloads) {
  const contributors = new Set()
  const repos = new Set()
  const cell = new Map() // key: `${contributor}|${repo}` -> {assisted,total}

  for (const p of payloads) {
    repos.add(p.repository)
    const m = computePrMetrics(p)
    for (const [contributor, c] of m.byContributor) {
      if (c.totalCommits === 0) continue
      contributors.add(contributor)
      const key = `${contributor}|${p.repository}`
      if (!cell.has(key)) cell.set(key, { assisted: 0, total: 0 })
      const e = cell.get(key)
      e.assisted += c.copilotAssisted
      e.total += c.totalCommits
    }
  }

  const contributorList = Array.from(contributors)
  const repoList = Array.from(repos)
  const data = []
  repoList.forEach((repo, x) => {
    contributorList.forEach((contributor, y) => {
      const e = cell.get(`${contributor}|${repo}`)
      data.push([x, y, e ? rate(e.assisted, e.total) : null])
    })
  })

  return {
    contributors: contributorList,
    repos: repoList.map(shortRepoName),
    data
  }
}

/** Assist-rate timeline (per PR, chronological) for the trend chart. */
export function selectAssistTrend(payloads) {
  return payloads
    .slice()
    .sort((a, b) => new Date(a.calculatedAt) - new Date(b.calculatedAt))
    .map((p) => {
      const m = computePrMetrics(p)
      return {
        label: `${shortRepoName(p.repository)} #${p.prNumber}`,
        date: p.calculatedAt,
        repository: p.repository,
        prNumber: p.prNumber,
        commitRate: m.copilotAssistedRate,
        lineRate: m.copilotAssistedLineRate
      }
    })
}

const HOUR_MS = 1000 * 60 * 60

/** Hours between two ISO timestamps (0 when either is missing). */
export function hoursBetween(a, b) {
  if (!a || !b) return 0
  return round((new Date(b) - new Date(a)) / HOUR_MS)
}

/** Human-friendly duration for a number of hours. */
export function formatDuration(hours) {
  if (hours == null || Number.isNaN(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${round(hours, 1)}h`
  const days = Math.floor(hours / 24)
  const rem = Math.round(hours % 24)
  return rem ? `${days}d ${rem}h` : `${days}d`
}

const median = (nums) => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2)
}

/** Per-PR delivery metrics: cycle time, time-to-merge, batch size, rework (Rebase excluded). */
export function selectDeliveryMetrics(payloads) {
  return payloads
    .map((p) => {
      const m = computePrMetrics(p)
      return {
        repository: p.repository,
        repoName: shortRepoName(p.repository),
        prNumber: p.prNumber,
        date: p.calculatedAt,
        cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt),
        timeToMergeHours: hoursBetween(p.prCreatedAt, p.prMergedAt),
        // A PR is "completed" once it has a valid merge timestamp; otherwise it
        // is still in progress.
        completed: isValidDateStr(p.prMergedAt),
        prMergedAt: p.prMergedAt ?? null,
        avgCommitSize: m.totalCommits
          ? round(m.totalLinesTouched / m.totalCommits, 1)
          : 0,
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

/** Average, fastest and slowest PR coding cycle time per repository, fastest first. */
export function selectRepoCycleTimes(payloads) {
  const byRepo = new Map()
  for (const m of selectDeliveryMetrics(payloads)) {
    if (!byRepo.has(m.repository)) {
      byRepo.set(m.repository, {
        repository: m.repository,
        name: m.repoName,
        cycles: [],
        prCount: 0
      })
    }
    const r = byRepo.get(m.repository)
    if (m.cycleHours > 0) r.cycles.push(m.cycleHours)
    r.prCount += 1
  }
  return Array.from(byRepo.values())
    .map(({ cycles, ...r }) => ({
      ...r,
      avgCycleHours: cycles.length
        ? cycles.reduce((a, b) => a + b, 0) / cycles.length
        : 0,
      fastest: cycles.length ? Math.min(...cycles) : 0,
      slowest: cycles.length ? Math.max(...cycles) : 0
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
      if (!Number.isFinite(mergedAt)) return null
      return {
        prNumber: pr.prNumber,
        mergedAt,
        merged: isMergedPayload(pr),
        cycleHours: hoursBetween(pr.firstCommitAt, pr.lastCommitAt),
        timeToMergeHours: hoursBetween(pr.prCreatedAt, pr.prMergedAt),
        batchSize: m.totalCommits
          ? round(m.totalLinesTouched / m.totalCommits, 1)
          : 0,
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
    avg: cycles.length
      ? round(cycles.reduce((a, b) => a + b, 0) / cycles.length, 1)
      : 0,
    median: median(cycles),
    fastest: cycles.length ? Math.min(...cycles) : 0,
    slowest: cycles.length ? Math.max(...cycles) : 0,
    measured: cycles.length,
    prCount: points.length
  }
}

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
    if (!byRepo.has(p.repository)) {
      byRepo.set(p.repository, {
        repository: p.repository,
        name: shortRepoName(p.repository),
        linesAdded: 0,
        linesDeleted: 0,
        prCount: 0,
        rebaseCommits: 0,
        rebaseLines: 0
      })
    }
    const r = byRepo.get(p.repository)
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
      reworkRatio: r.linesAdded ? round(r.linesDeleted / r.linesAdded, 2) : 0
    }))
    .sort((a, b) => b.reworkRatio - a.reworkRatio)

  const totalAdded = repos.reduce((s, r) => s + r.linesAdded, 0)
  const totalDeleted = repos.reduce((s, r) => s + r.linesDeleted, 0)

  return {
    repos,
    totalAdded,
    totalDeleted,
    portfolioReworkRatio: totalAdded ? round(totalDeleted / totalAdded, 2) : 0
  }
}

/**
 * Copilot Leverage — the geometric mean of three already 0–1-bounded signals,
 * so a weakness in any one pulls the whole score toward 0 (no single strong
 * dimension can mask the others). Reported as a 0–100 index (a percentage),
 * NOT a multiplier:
 *
 *  - Coverage   how much of the delivered code Copilot touched
 *               (copilotAssistedLines ÷ totalLinesTouched).
 *  - Efficiency "Flow" — the delivery-speed advantage of Copilot-led PRs,
 *               measured from cycle time (first→last commit) rather than
 *               lines of code. The Copilot-led median is measured from the
 *               ACTIVE time window (current delivery speed); the
 *               manually-led median is a HISTORICAL BASELINE drawn from every
 *               manually-led PR ever recorded for the scope, regardless of
 *               time window — median cycle time is stable enough not to need
 *               a matching window, and a manual cohort only exists during the
 *               Copilot transition, so restricting it to "now" makes the
 *               baseline vanish exactly as adoption approaches 100%. The raw
 *               signal is baselineMedianCycle ÷ copilotMedianCycle (>1 means
 *               Copilot-led PRs finish faster than the historical baseline),
 *               normalised so "2× faster or better" = 1.0 and "same speed" =
 *               0.5. Speed is the outcome GitHub and DORA research actually
 *               tie to AI assistance; lines-per-commit is explicitly
 *               discouraged as gameable. When a repository has no historical
 *               manually-led PRs of its own, the portfolio-wide historical
 *               baseline is used instead; if that is unavailable too,
 *               Efficiency is neutral (0.5).
 *               NOTE: cycle-time comparisons carry selection bias (Copilot-led
 *               PRs may simply be smaller) — pair this with the Rework guardrail.
 *               NOTE: if literally no manually-led PR has ever been recorded
 *               anywhere, Efficiency stays pinned at 0.5 and Leverage cannot
 *               exceed cbrt(1 × 0.5 × 1) ≈ 79% even with perfect
 *               Coverage/Adoption — a deliberate "don't invent evidence"
 *               choice, not a bug. See docs/README.md § Copilot Leverage —
 *               Calculation Detail.
 *  - Adoption   share of contributors who used Copilot at least once.
 */
const FLOW_MIN_BUCKET = 2 // Copilot-led PRs needed in the active window for a trustworthy "current speed" reading
const HISTORICAL_MANUAL_MIN = 1 // manually-led PRs needed anywhere in history to trust the baseline
const COPILOT_LED_THRESHOLD = 50 // commit assist rate (%) at/above which a PR is "Copilot-led"

/** Normalise a baseline÷copilot cycle-time ratio so 2×-faster→1, same→0.5, slower→<0.5. */
const flowRatioToScore = (ratio) => clamp01(ratio / 2)

/** Current-window Copilot-led cycle-time signal: median, count, and trustworthiness. */
function copilotFlowFor(scopeRows) {
  const cycles = scopeRows
    .filter((r) => r.assistRate >= COPILOT_LED_THRESHOLD && r.cycleHours > 0)
    .map((r) => r.cycleHours)
  return {
    median: round(median(cycles), 1),
    count: cycles.length,
    available: cycles.length >= FLOW_MIN_BUCKET
  }
}

/**
 * Historical manually-led cycle-time baseline for a scope (one repository, or
 * the whole portfolio when `repository` is null). Drawn from `historyRows`,
 * which is NOT restricted to the active time window.
 */
function manualBaselineFor(historyRows, repository) {
  const scoped =
    repository == null
      ? historyRows
      : historyRows.filter((r) => r.repository === repository)
  const cycles = scoped
    .filter((r) => r.assistRate < COPILOT_LED_THRESHOLD && r.cycleHours > 0)
    .map((r) => r.cycleHours)
  return {
    median: round(median(cycles), 1),
    count: cycles.length,
    available: cycles.length >= HISTORICAL_MANUAL_MIN
  }
}

/**
 * @param {object[]} payloads - PRs in the active time window (drives Coverage,
 *   Adoption, and the "current speed" side of Efficiency).
 * @param {object[]} [historyPayloads] - ALL known PRs regardless of time
 *   window, used only for the manually-led cycle-time baseline. Defaults to
 *   `payloads` (legacy behaviour: baseline scoped to the active window) when
 *   the caller has no broader history to offer.
 */
export function selectCopilotLeverage(payloads, historyPayloads = payloads) {
  const toRow = (p) => {
    const m = computePrMetrics(p)
    return {
      repository: p.repository,
      m,
      assistRate: m.copilotAssistedRate,
      cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt)
    }
  }

  const rows = payloads.map(toRow)
  // Avoid recomputing computePrMetrics when the caller passed the same array
  // for both parameters (no separate history available).
  const historyRows =
    historyPayloads === payloads
      ? rows
      : historyPayloads.map((p) => ({
          repository: p.repository,
          assistRate: computePrMetrics(p).copilotAssistedRate,
          cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt)
        }))

  const repoContributors = new Map() // repository -> { all: Set, adopters: Set }
  for (const { repository, m } of rows) {
    if (!repoContributors.has(repository)) {
      repoContributors.set(repository, { all: new Set(), adopters: new Set() })
    }
    const s = repoContributors.get(repository)
    for (const [author, c] of m.byContributor) {
      if (c.totalCommits === 0) continue
      s.all.add(author)
      if (c.copilotAssisted > 0) s.adopters.add(author)
    }
  }

  const portfolioBaseline = manualBaselineFor(historyRows, null)

  function scoreFor(scopeRows, repository) {
    let copilotLines = 0
    let totalLines = 0
    for (const { m } of scopeRows) {
      copilotLines += m.copilotAssistedLines
      totalLines += m.totalLinesTouched
    }
    const copilotFlow = copilotFlowFor(scopeRows)
    const localBaseline =
      repository == null
        ? portfolioBaseline
        : manualBaselineFor(historyRows, repository)
    const baseline = localBaseline.available ? localBaseline : portfolioBaseline
    const efficiency =
      copilotFlow.available && baseline.available
        ? flowRatioToScore(round(baseline.median / copilotFlow.median, 2))
        : 0.5
    return {
      coverage: totalLines ? clamp01(copilotLines / totalLines) : 0,
      efficiency,
      flowRatio:
        copilotFlow.available && baseline.available
          ? round(baseline.median / copilotFlow.median, 2)
          : null,
      flowAvailable: copilotFlow.available && baseline.available,
      baselineLocal: localBaseline.available,
      copilotMedianCycleHours: copilotFlow.median,
      baselineMedianCycleHours: baseline.median,
      baselineCount: baseline.count
    }
  }

  const contributors = selectContributorSummaries(payloads)
  const portfolioAdoption = contributors.length
    ? clamp01(
        contributors.filter((c) => c.copilotAssisted > 0).length /
          contributors.length
      )
    : 0
  const portfolio = scoreFor(rows, null)

  const byRepo = new Map()
  for (const row of rows) {
    if (!byRepo.has(row.repository)) byRepo.set(row.repository, [])
    byRepo.get(row.repository).push(row)
  }

  const repos = Array.from(byRepo.entries())
    .map(([repository, scopeRows]) => {
      const s = scoreFor(scopeRows, repository)
      const cs = repoContributors.get(repository)
      const adoption = cs.all.size ? clamp01(cs.adopters.size / cs.all.size) : 0
      const raw = Math.cbrt(s.coverage * s.efficiency * adoption)
      return {
        repository,
        name: shortRepoName(repository),
        leveragePct: round(raw * 100),
        coverage: round(s.coverage * 100, 1),
        efficiency: round(s.efficiency * 100, 1),
        adoption: round(adoption * 100, 1),
        flowRatio: s.flowRatio,
        flowAvailable: s.flowAvailable,
        baselineLocal: s.baselineLocal,
        copilotMedianCycleHours: s.copilotMedianCycleHours,
        baselineMedianCycleHours: s.baselineMedianCycleHours,
        baselineCount: s.baselineCount
      }
    })
    .sort((a, b) => b.leveragePct - a.leveragePct)

  const portfolioRaw = Math.cbrt(
    portfolio.coverage * portfolio.efficiency * portfolioAdoption
  )

  return {
    leveragePct: round(portfolioRaw * 100),
    coverage: round(portfolio.coverage * 100, 1),
    efficiency: round(portfolio.efficiency * 100, 1),
    adoption: round(portfolioAdoption * 100, 1),
    flowRatio: portfolio.flowRatio,
    flowAvailable: portfolio.flowAvailable,
    copilotMedianCycleHours: portfolio.copilotMedianCycleHours,
    baselineMedianCycleHours: portfolio.baselineMedianCycleHours,
    baselineCount: portfolio.baselineCount,
    repos
  }
}

/**
 * Portfolio-level delivery KPIs derived across all PRs (Rebase excluded).
 * `historyPayloads` (all known PRs, any time window) feeds only the Copilot
 * Leverage manually-led cycle-time baseline — see selectCopilotLeverage.
 */
export function selectDeliverySummary(payloads, historyPayloads = payloads) {
  const metrics = selectDeliveryMetrics(payloads)
  const cycles = metrics.map((m) => m.cycleHours).filter((h) => h > 0)

  let totalCommits = 0
  let totalLines = 0
  for (const p of payloads) {
    const m = computePrMetrics(p)
    totalCommits += m.totalCommits
    totalLines += m.totalLinesTouched
  }

  const contributors = selectContributorSummaries(payloads)
  const adopters = contributors.filter((c) => c.copilotAssisted > 0).length
  const rework = selectRepoRework(payloads)
  const leverage = selectCopilotLeverage(payloads, historyPayloads)

  return {
    avgCycleHours: cycles.length
      ? round(cycles.reduce((a, b) => a + b, 0) / cycles.length, 1)
      : 0,
    medianCycleHours: median(cycles),
    fastestCycleHours: cycles.length ? Math.min(...cycles) : 0,
    avgCommitSize: totalCommits ? round(totalLines / totalCommits, 1) : 0,
    reworkRatio: rework.portfolioReworkRatio,
    linesAdded: rework.totalAdded,
    linesDeleted: rework.totalDeleted,
    netLines: rework.totalAdded - rework.totalDeleted,
    copilotLeverage: leverage.leveragePct,
    leverageCoverage: leverage.coverage,
    leverageEfficiency: leverage.efficiency,
    leverageAdoption: leverage.adoption,
    leverageFlowRatio: leverage.flowRatio,
    leverageFlowAvailable: leverage.flowAvailable,
    copilotMedianCycleHours: leverage.copilotMedianCycleHours,
    baselineMedianCycleHours: leverage.baselineMedianCycleHours,
    baselineCount: leverage.baselineCount,
    adoptionPct: contributors.length
      ? round((adopters / contributors.length) * 100, 1)
      : 0,
    adopters,
    contributorTotal: contributors.length,
    rebaseCommits: metrics.reduce((s, m) => s + m.rebaseCommits, 0),
    rebaseLines: metrics.reduce((s, m) => s + m.rebaseLines, 0)
  }
}

/**
 * Flattened, chronologically-ordered commit stream using each commit's actual
 * `committedAt` timestamp from the payload. Powers the live commit-level
 * insights chart and all time-based KPI selectors. Rebase/merge commits are
 * excluded — the stream tells the Copilot-vs-manual delivery story.
 */
export function selectCommitTimeline(payloads) {
  const rows = []
  for (const p of payloads) {
    if (!Array.isArray(p.commitBreakdown)) continue
    for (const c of p.commitBreakdown) {
      // Skip any commit missing the fields the stream/scatter rely on.
      if (!isPlottableCommit(c)) continue
      const classification = effectiveClassification(c)
      if (isExcludedClassification(classification)) continue
      rows.push({
        ...c,
        classification,
        repository: p.repository,
        repoName: shortRepoName(p.repository),
        prNumber: p.prNumber,
        committedAt: c.committedAt
      })
    }
  }
  return rows.sort((a, b) => new Date(a.committedAt) - new Date(b.committedAt))
}

/**
 * Per-repository "delivery profile" for a radar chart. Every axis is normalised
 * to 0–100 where higher is better, so repositories can be compared as shapes:
 *   Commit Assist   — Copilot-assisted share of commits
 *   Line Assist     — Copilot-assisted share of lines
 *   Adoption        — contributors who used Copilot / all contributors
 *   Delivery Speed  — inverse of avg cycle time vs a 48h target
 *   Rework Control  — inverse of rework ratio (deleted/added) vs a 1.0 target
 * Rebase commits are excluded from every input.
 */
export function selectRepoProfiles(payloads) {
  const TARGET_CYCLE_H = 48
  const TARGET_REWORK = 1

  const byRepo = new Map()
  for (const p of payloads) {
    const key = p.repository
    if (!byRepo.has(key)) {
      byRepo.set(key, {
        repository: key,
        name: shortRepoName(key),
        copilotCommits: 0,
        totalCommits: 0,
        copilotLines: 0,
        totalLines: 0,
        added: 0,
        deleted: 0,
        cycles: [],
        adopters: new Set(),
        contributors: new Set()
      })
    }
    const r = byRepo.get(key)
    const m = computePrMetrics(p)
    r.copilotCommits += m.copilotAssistedCommits
    r.totalCommits += m.totalCommits
    r.copilotLines += m.copilotAssistedLines
    r.totalLines += m.totalLinesTouched
    r.added += m.linesAdded
    r.deleted += m.linesDeleted
    const cyc = hoursBetween(p.firstCommitAt, p.lastCommitAt)
    if (cyc > 0) r.cycles.push(cyc)
    for (const [author, c] of m.byContributor) {
      if (c.totalCommits === 0) continue
      r.contributors.add(author)
      if (c.copilotAssisted > 0) r.adopters.add(author)
    }
  }

  const indicators = [
    { name: 'Commit Assist', max: 100 },
    { name: 'Line Assist', max: 100 },
    { name: 'Adoption', max: 100 },
    { name: 'Delivery Speed', max: 100 },
    { name: 'Rework Control', max: 100 }
  ]

  const repos = Array.from(byRepo.values())
    .map((r) => {
      const avgCycle = r.cycles.length
        ? r.cycles.reduce((a, b) => a + b, 0) / r.cycles.length
        : 0
      const rework = r.added ? r.deleted / r.added : 0
      return {
        name: r.name,
        key: r.repository,
        values: [
          rate(r.copilotCommits, r.totalCommits),
          rate(r.copilotLines, r.totalLines),
          r.contributors.size
            ? round((r.adopters.size / r.contributors.size) * 100)
            : 0,
          round(100 * (1 - clamp01(avgCycle / TARGET_CYCLE_H))),
          round(100 * (1 - clamp01(rework / TARGET_REWORK)))
        ]
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { indicators, repos }
}

/**
 * Aggregates delivery + Copilot metrics per persona (role) so every role's
 * contribution is showcased, not just per-repository totals. Each
 * contributor is attributed to one persona via `personaForContributor`,
 * keyed off their GitHub handle — so a single PR can feed more than one
 * persona when it has commits from contributors in different roles.
 * `mappingsByHandle` (from `buildContributorPersonaMap`) is the configured
 * handle → persona lookup; contributors absent from it default to
 * Developers. Rebase/merge commits and rebase-only authors are already
 * excluded upstream in `computePrMetrics`. Always returns one row per
 * persona (in `PERSONAS` order) — a role with no activity in the window
 * returns zeroed metrics so the UI can show it empty.
 */
export function selectPersonaSummaries(payloads, mappingsByHandle = {}) {
  const init = () => ({
    repos: new Set(),
    prs: new Set(),
    totalCommits: 0,
    copilotAssistedCommits: 0,
    totalLinesTouched: 0,
    copilotAssistedLines: 0,
    linesAdded: 0,
    linesDeleted: 0,
    cycles: [],
    contributors: new Set(),
    adopters: new Set()
  })
  const byPersona = new Map(PERSONAS.map((p) => [p.id, init()]))

  for (const p of payloads) {
    const m = computePrMetrics(p)
    const cyc = hoursBetween(p.firstCommitAt, p.lastCommitAt)
    const prKey = `${p.repository}#${p.prNumber}`
    const personaIdsInPr = new Set()

    for (const [author, c] of m.byContributor) {
      if (c.totalCommits === 0) continue
      const personaId = personaForContributor(author, mappingsByHandle)
      const agg = byPersona.get(personaId) ?? byPersona.get(PERSONAS[0].id)
      agg.repos.add(p.repository)
      agg.totalCommits += c.totalCommits
      agg.copilotAssistedCommits += c.copilotAssisted
      agg.totalLinesTouched += c.linesTouched
      agg.copilotAssistedLines += c.copilotAssistedLines
      agg.linesAdded += c.linesAdded
      agg.linesDeleted += c.linesDeleted
      agg.contributors.add(author)
      if (c.copilotAssisted > 0) agg.adopters.add(author)
      personaIdsInPr.add(personaId)
    }

    for (const personaId of personaIdsInPr) {
      const agg = byPersona.get(personaId) ?? byPersona.get(PERSONAS[0].id)
      agg.prs.add(prKey)
      if (cyc > 0) agg.cycles.push(cyc)
    }
  }

  return PERSONAS.map((persona) => {
    const a = byPersona.get(persona.id)
    return {
      id: persona.id,
      label: persona.label,
      icon: persona.icon,
      repoCount: a.repos.size,
      repoNames: Array.from(a.repos).map(shortRepoName).sort(),
      prCount: a.prs.size,
      totalCommits: a.totalCommits,
      copilotAssistedCommits: a.copilotAssistedCommits,
      contributorCount: a.contributors.size,
      adopters: a.adopters.size,
      adoptionPct: rate(a.adopters.size, a.contributors.size),
      copilotAssistedRate: rate(a.copilotAssistedCommits, a.totalCommits),
      copilotAssistedLineRate: rate(
        a.copilotAssistedLines,
        a.totalLinesTouched
      ),
      netLines: a.linesAdded - a.linesDeleted,
      avgCycleHours: a.cycles.length
        ? round(a.cycles.reduce((x, y) => x + y, 0) / a.cycles.length, 1)
        : 0
    }
  })
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Pull requests per Jira key, from the payloads' `jiraKeys`. */
export function selectPrsByTicket(payloads) {
  const byKey = new Map()
  for (const p of payloads ?? []) {
    if (!Array.isArray(p?.jiraKeys)) continue
    for (const key of p.jiraKeys) {
      if (typeof key !== 'string') continue
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push({
        repository: p.repository,
        prNumber: p.prNumber,
        title: p.prTitle ?? '',
        merged: isMergedPayload(p)
      })
    }
  }
  return byKey
}

/** Ticket table rows: cycle time is started to resolved, in days. */
export function selectTicketRows(issues, payloads) {
  const prs = selectPrsByTicket(payloads)
  return (issues ?? [])
    .filter((issue) => typeof issue?.key === 'string')
    .map((issue) => {
      const created = Date.parse(issue.created)
      const started = Date.parse(issue.started ?? issue.created)
      const resolved = Date.parse(issue.resolved)
      const cycleDays =
        Number.isFinite(started) && Number.isFinite(resolved)
          ? round(Math.max(0, resolved - started) / DAY_MS, 1)
          : null
      const leadDays =
        Number.isFinite(created) && Number.isFinite(resolved)
          ? round(Math.max(0, resolved - created) / DAY_MS, 1)
          : null
      return {
        key: issue.key,
        summary: issue.summary ?? '',
        type: issue.issueType ?? '',
        status: issue.status?.name ?? '',
        category: issue.status?.categoryKey ?? '',
        storyPoints: Number.isFinite(Number(issue.storyPoints))
          ? Number(issue.storyPoints)
          : null,
        created: Number.isFinite(created) ? created : null,
        cycleDays,
        leadDays,
        resolved: Number.isFinite(resolved) ? resolved : null,
        reopenCount: Number(issue.reopenCount) || 0,
        links: (Array.isArray(issue.issueLinks) ? issue.issueLinks : [])
          .filter((l) => typeof l?.key === 'string')
          .map((l) => ({
            key: l.key,
            type: l.type ?? '',
            issueType: l.issueType ?? ''
          })),
        history: (Array.isArray(issue.statusHistory) ? issue.statusHistory : [])
          .filter((h) => Number.isFinite(Date.parse(h?.at)))
          .map((h) => ({
            at: Date.parse(h.at),
            from: h.from ?? '',
            to: h.to ?? ''
          })),
        prs: prs.get(issue.key) ?? []
      }
    })
}

/**
 * Per-sprint delivery points, oldest first, from newest-first sprints and the
 * matching delivery-metrics responses. Missing or failed sprints read as null.
 */
export function selectDeliveryTrend(results, sprints) {
  const num = (v) => (Number.isFinite(v) ? v : null)
  return (sprints ?? [])
    .map((sprint, i) => {
      const m = results?.[i] ?? {}
      return {
        label: sprint.label ?? `Sprint ${sprint.index ?? i + 1}`,
        delivered: num(m.storiesDelivered),
        predictability: num(m.sprintPredictability),
        changeFailRate: num(m.changeFailRate),
        changeLeadTimeDays: num(m.changeLeadTimeDays)
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

/**
 * Where each ticket sits: Jira's status category, with an in-progress ticket
 * whose linked PRs are all merged counted as "PR merged".
 */
export function selectTicketFunnel(rows) {
  const counts = [0, 0, 0, 0]
  for (const row of rows) {
    if (row.category === 'done') counts[3] += 1
    else if (row.prs.length > 0 && row.prs.every((pr) => pr.merged)) {
      counts[2] += 1
    } else if (row.category === 'indeterminate') counts[1] += 1
    else counts[0] += 1
  }
  return counts
}

export const COMPLEXITY_BANDS = ['XS', 'S', 'M', 'L', 'XL']

const medianOf = (values) => {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

/** Per-repository delivery comparison with no adoption measures (AI-native). */
export function selectNativeRepoComparison(payloads) {
  const byRepo = new Map()
  for (const p of payloads ?? []) {
    if (!p?.repository) continue
    if (!byRepo.has(p.repository)) byRepo.set(p.repository, [])
    byRepo.get(p.repository).push(p)
  }
  return [...byRepo.entries()]
    .map(([repository, prs]) => {
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
    })
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

// ── AI code survival and Copilot usage ──────────────────────────────────────

const CHURN_ORIGINS = [
  { id: 'aiAgent', label: 'Agent' },
  { id: 'aiCompletion', label: 'Completion' },
  { id: 'aiChat', label: 'Chat' }
]

/**
 * AI code churn (CCR_N, docs/metrics.md) from the backend churn response.
 * Unavailable until the survival workflow has measured at least one PR.
 */
export function selectAiCodeChurnRate(churn) {
  if (!churn || churn.available !== true) {
    return {
      available: false,
      windowDays: Number(churn?.windowDays) || 21,
      reason: typeof churn?.reason === 'string' ? churn.reason : null,
      prCount: num(churn?.prCount)
    }
  }
  return {
    available: true,
    windowDays: num(churn.windowDays),
    percent: num(churn.churnRatePercent),
    humanPercent: isFiniteNum(churn.humanChurnPercent)
      ? churn.humanChurnPercent
      : null,
    penaltyApplied: churn.penaltyApplied === true,
    multiplier: isFiniteNum(churn.effectiveMultiplier)
      ? churn.effectiveMultiplier
      : 1,
    prCount: num(churn.prCount),
    aiLinesMerged: num(churn.aiLinesMerged),
    aiLinesSurviving: num(churn.aiLinesSurviving),
    byOrigin: CHURN_ORIGINS.map(({ id, label }) => ({
      id,
      label,
      merged: num(churn.byOrigin?.[id]?.merged),
      surviving: num(churn.byOrigin?.[id]?.surviving),
      churnPercent: isFiniteNum(churn.byOrigin?.[id]?.churnPercent)
        ? churn.byOrigin[id].churnPercent
        : null
    }))
  }
}

function* usageCommits(payload) {
  for (const commit of payload?.commitBreakdown ?? []) {
    const attribution = commit?.attribution
    if (attribution?.source !== 'extension') continue
    if (!attribution.usage || !Array.isArray(attribution.usage.models)) continue
    yield { commit, usage: attribution.usage }
  }
}

/**
 * Copilot model and token usage across pull requests, from the extension's
 * per-commit attribution. Team and model level only; never per person.
 * Coverage says how many Copilot-assisted PRs carry usage at all.
 */
export function selectCopilotUsage(payloads) {
  const byModel = new Map()
  const perPrTokens = []
  let assistedPrs = 0

  for (const payload of payloads ?? []) {
    let assisted = false
    let tokens = 0
    let hasUsage = false

    for (const commit of payload.commitBreakdown ?? []) {
      const attribution = commit?.attribution
      const writtenByCopilot =
        attribution?.source === 'extension' &&
        num(attribution.aiCompletionLines) +
          num(attribution.aiChatLines) +
          num(attribution.aiAgentLines) >
          0
      if (commit?.classification === 'Copilot-assisted' || writtenByCopilot) {
        assisted = true
      }
    }

    for (const { usage } of usageCommits(payload)) {
      for (const m of usage.models) {
        if (typeof m?.model !== 'string') continue
        const entry = byModel.get(m.model) ?? {
          model: m.model,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0
        }
        entry.requests += num(m.requests)
        entry.inputTokens += num(m.inputTokens)
        entry.outputTokens += num(m.outputTokens)
        entry.cachedTokens +=
          num(m.cacheReadTokens) + num(m.cacheCreationTokens)
        byModel.set(m.model, entry)
        tokens += num(m.inputTokens) + num(m.outputTokens)
        hasUsage = true
      }
    }
    if (assisted) assistedPrs += 1
    if (hasUsage) perPrTokens.push(tokens)
  }

  const models = [...byModel.values()].sort(
    (a, b) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) ||
      a.model.localeCompare(b.model)
  )
  return {
    models,
    prsWithUsage: perPrTokens.length,
    assistedPrs,
    coveragePercent:
      assistedPrs > 0
        ? round((perPrTokens.length / assistedPrs) * 100, 1)
        : null,
    medianTokensPerPr: perPrTokens.length
      ? Math.round(median(perPrTokens))
      : null
  }
}

export const RESERVED_USAGE_MODELS = new Set(['other', 'unknown'])
export const SUPERLATIVE_MIN_PRS = 2
export const CACHE_MIN_INPUT_TOKENS = 10_000
export const ECONOMISER_MIN_REQUESTS = 5
export const DEEP_THINKER_MIN_OUTPUT_TOKENS = 1_000
export const NIGHT_OWL_MIN_REQUESTS = 5
export const CACHE_RATING_THRESHOLDS = { high: 60, medium: 30 }

export function cacheRating(hitRate) {
  if (hitRate === null) return null
  if (hitRate >= CACHE_RATING_THRESHOLDS.high) return 'high'
  if (hitRate >= CACHE_RATING_THRESHOLDS.medium) return 'medium'
  return 'low'
}

const cappedPercent = (part, whole) =>
  whole > 0 ? Math.min(100, round((part / whole) * 100, 1)) : null

const isOutOfHours = (date) => date.getHours() >= 19 || date.getHours() < 7

function accrueUsageModels(payloads) {
  const byModel = new Map()
  const prModels = new Map()

  for (const payload of payloads ?? []) {
    const prKey = `${payload?.repository}#${payload?.prNumber}`
    for (const { commit, usage } of usageCommits(payload)) {
      const committedAt = new Date(commit.committedAt)
      const timed = !Number.isNaN(committedAt.getTime())
      const outOfHours = timed && isOutOfHours(committedAt)

      for (const m of usage.models) {
        if (typeof m?.model !== 'string' || m.model === '') continue
        const entry = byModel.get(m.model) ?? {
          model: m.model,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
          prs: new Set(),
          outOfHoursRequests: 0,
          timedRequests: 0
        }
        const requests = num(m.requests)
        entry.requests += requests
        entry.inputTokens += num(m.inputTokens)
        entry.outputTokens += num(m.outputTokens)
        entry.cacheReadTokens += num(m.cacheReadTokens)
        entry.cacheCreationTokens += num(m.cacheCreationTokens)
        entry.reasoningTokens += num(m.reasoningTokens)
        entry.prs.add(prKey)
        if (timed) entry.timedRequests += requests
        if (outOfHours) entry.outOfHoursRequests += requests
        byModel.set(m.model, entry)

        if (!RESERVED_USAGE_MODELS.has(m.model)) {
          const set = prModels.get(prKey) ?? new Set()
          set.add(m.model)
          prModels.set(prKey, set)
        }
      }
    }
  }
  return { byModel, prModels }
}

function buildSuperlatives(named, variety) {
  const eligible = named.filter((m) => m.prCount >= SUPERLATIVE_MIN_PRS)
  const pick = (id, metric, qualifies, value, direction) => {
    const winner = eligible
      .filter((m) => qualifies(m) && value(m) !== null)
      .sort(
        (a, b) =>
          direction * (value(b) - value(a)) ||
          b.requests - a.requests ||
          a.model.localeCompare(b.model)
      )[0]
    return winner
      ? { id, model: winner.model, metric, value: value(winner) }
      : null
  }

  const found = [
    pick(
      'token-heavyweight',
      'tokenShare',
      (m) => m.totalTokens > 0,
      (m) => m.tokenShare,
      1
    ),
    pick(
      'cache-champion',
      'cacheHitRate',
      (m) => m.inputTokens >= CACHE_MIN_INPUT_TOKENS,
      (m) => m.cacheHitRate,
      1
    ),
    pick(
      'token-economiser',
      'tokensPerRequest',
      (m) => m.requests >= ECONOMISER_MIN_REQUESTS,
      (m) => m.tokensPerRequest,
      -1
    ),
    pick(
      'deep-thinker',
      'reasoningShare',
      (m) =>
        m.outputTokens >= DEEP_THINKER_MIN_OUTPUT_TOKENS &&
        m.reasoningTokens > 0,
      (m) => m.reasoningShare,
      1
    ),
    pick(
      'night-owl',
      'outOfHoursShare',
      (m) => m.requests >= NIGHT_OWL_MIN_REQUESTS && m.outOfHoursShare > 0,
      (m) => m.outOfHoursShare,
      1
    )
  ]
  if (variety.distinctModels >= 2) {
    found.push({
      id: 'prompt-polyglot',
      model: null,
      metric: 'distinctModels',
      value: variety.distinctModels,
      multiModelPrShare: variety.multiModelPrShare
    })
  }
  return found.filter(Boolean)
}

/**
 * Copilot usage insights at team and model level. Never reads authors or
 * contributor breakdowns, so nothing here can identify a person.
 */
export function selectCopilotInsights(payloads) {
  const usage = selectCopilotUsage(payloads)
  const { byModel, prModels } = accrueUsageModels(payloads)

  const entries = [...byModel.values()]
  const grandRequests = entries.reduce((s, m) => s + m.requests, 0)
  const grandTokens = entries.reduce(
    (s, m) => s + m.inputTokens + m.outputTokens,
    0
  )

  const models = entries
    .map((m) => {
      const totalTokens = m.inputTokens + m.outputTokens
      const cacheHitRate = cappedPercent(m.cacheReadTokens, m.inputTokens)
      return {
        model: m.model,
        requests: m.requests,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheCreationTokens: m.cacheCreationTokens,
        reasoningTokens: m.reasoningTokens,
        totalTokens,
        requestShare:
          grandRequests > 0 ? round((m.requests / grandRequests) * 100, 1) : 0,
        tokenShare:
          grandTokens > 0 ? round((totalTokens / grandTokens) * 100, 1) : 0,
        cacheHitRate,
        cacheRating: cacheRating(cacheHitRate),
        tokensPerRequest:
          m.requests > 0 ? Math.round(totalTokens / m.requests) : null,
        reasoningShare: cappedPercent(m.reasoningTokens, m.outputTokens),
        outOfHoursShare: cappedPercent(m.outOfHoursRequests, m.timedRequests),
        prCount: m.prs.size,
        reserved: RESERVED_USAGE_MODELS.has(m.model),
        rank: null
      }
    })
    .sort(
      (a, b) =>
        b.requests - a.requests ||
        b.totalTokens - a.totalTokens ||
        a.model.localeCompare(b.model)
    )

  const named = models.filter((m) => !m.reserved)
  named.forEach((m, i) => {
    m.rank = i + 1
  })

  const lead = named.find((m) => m.requests > 0) ?? named[0] ?? null
  const runnerUp = lead ? named[named.indexOf(lead) + 1] : null
  const favourite = lead
    ? {
        model: lead.model,
        requests: lead.requests,
        requestShare: lead.requestShare,
        prCount: lead.prCount,
        leadPoints: round(lead.requestShare - (runnerUp?.requestShare ?? 0), 1)
      }
    : null

  const namedRequests = named.reduce((s, m) => s + m.requests, 0)
  const hhi = named.reduce(
    (s, m) => s + (m.requests / (namedRequests || 1)) ** 2,
    0
  )
  const multiModelPrs = [...prModels.values()].filter(
    (set) => set.size >= 2
  ).length
  const variety = {
    distinctModels: named.length,
    effectiveModels: namedRequests > 0 ? round(1 / hhi, 1) : null,
    multiModelPrShare:
      usage.prsWithUsage > 0
        ? round((multiModelPrs / usage.prsWithUsage) * 100, 1)
        : null
  }

  const totals = models.reduce(
    (t, m) => ({
      requests: t.requests + m.requests,
      inputTokens: t.inputTokens + m.inputTokens,
      outputTokens: t.outputTokens + m.outputTokens,
      cacheReadTokens: t.cacheReadTokens + m.cacheReadTokens,
      cacheCreationTokens: t.cacheCreationTokens + m.cacheCreationTokens,
      reasoningTokens: t.reasoningTokens + m.reasoningTokens
    }),
    {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0
    }
  )
  totals.totalTokens = totals.inputTokens + totals.outputTokens
  totals.cacheHitRate = cappedPercent(
    totals.cacheReadTokens,
    totals.inputTokens
  )
  totals.tokensPerRequest =
    totals.requests > 0
      ? Math.round(totals.totalTokens / totals.requests)
      : null

  return {
    hasUsage: models.length > 0,
    coverage: {
      prsWithUsage: usage.prsWithUsage,
      assistedPrs: usage.assistedPrs,
      coveragePercent: usage.coveragePercent
    },
    medianTokensPerPr: usage.medianTokensPerPr,
    totals,
    models,
    favourite,
    variety,
    superlatives: buildSuperlatives(named, variety)
  }
}

/** Top `limit` entries by `key`, the rest merged into one 'Other models' entry. */
export function foldModels(models, limit, key) {
  const sorted = [...(models ?? [])].sort((a, b) => num(b[key]) - num(a[key]))
  if (sorted.length <= limit) return sorted
  const rest = sorted.slice(limit)
  return [
    ...sorted.slice(0, limit),
    {
      model: 'Other models',
      [key]: rest.reduce((s, m) => s + num(m[key]), 0)
    }
  ]
}

export { round, rate }
