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

  for (const c of commits) {
    const author = c.author ?? 'Unknown'
    const kind = effectiveClassification(c)

    // Rebase/merge and Dependabot commits are excluded from every metric.
    // Critically, an author who ONLY appears on excluded commits is never
    // registered as a contributor, so neither rebase-derived names nor bots
    // can leak into any contributor count, adoption denominator, heatmap
    // cell, or persona insight anywhere.
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

  return {
    repository: payload.repository,
    prNumber: payload.prNumber,
    ...m,
    netLines: m.linesAdded - m.linesDeleted,
    reworkRatio: m.linesAdded ? round(m.linesDeleted / m.linesAdded, 2) : 0,
    copilotAssistedRate: rate(m.copilotAssistedCommits, m.totalCommits),
    copilotAssistedLineRate: rate(m.copilotAssistedLines, m.totalLinesTouched),
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
      copilotAssistedLineRate: rate(r.copilotAssistedLines, r.totalLinesTouched)
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
      accent: persona.accent,
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

export { round, rate }
