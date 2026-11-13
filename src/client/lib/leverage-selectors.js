import { selectContributorSummaries } from './contributor-selectors.js'
import { selectDeliveryMetrics, selectRepoRework } from './cycle-selectors.js'
import {
  COPILOT_LED_THRESHOLD,
  addContributors,
  avgCommitSize,
  clamp01,
  computePrMetrics,
  hoursBetween,
  mean,
  median,
  round,
  shortRepoName
} from './selector-core.js'

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
const NEUTRAL_EFFICIENCY = 0.5
const PERCENT = 100

/** Normalise a baseline÷copilot cycle-time ratio so 2×-faster→1, same→0.5, slower→<0.5. */
const flowRatioToScore = (ratio) => clamp01(ratio / 2)

const pct = (share) => round(share * PERCENT, 1)

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

const historyRow = (p, m) => ({
  repository: p.repository,
  assistRate: m.copilotAssistedRate,
  cycleHours: hoursBetween(p.firstCommitAt, p.lastCommitAt)
})

function groupByRepository(rows) {
  const byRepo = new Map()
  for (const row of rows) {
    const list = byRepo.get(row.repository) ?? []
    list.push(row)
    byRepo.set(row.repository, list)
  }
  return byRepo
}

/** Coverage and Efficiency for one scope, with the flow figures behind them. */
function scoreFor(scopeRows, localBaseline, portfolioBaseline) {
  let copilotLines = 0
  let totalLines = 0
  for (const { m } of scopeRows) {
    copilotLines += m.copilotAssistedLines
    totalLines += m.totalLinesTouched
  }
  const copilotFlow = copilotFlowFor(scopeRows)
  const baseline = localBaseline.available ? localBaseline : portfolioBaseline
  const flowAvailable = copilotFlow.available && baseline.available
  const flowRatio = flowAvailable
    ? round(baseline.median / copilotFlow.median, 2)
    : null
  return {
    coverage: totalLines ? clamp01(copilotLines / totalLines) : 0,
    efficiency: flowAvailable
      ? flowRatioToScore(flowRatio)
      : NEUTRAL_EFFICIENCY,
    flowRatio,
    flowAvailable,
    baselineLocal: localBaseline.available,
    copilotMedianCycleHours: copilotFlow.median,
    baselineMedianCycleHours: baseline.median,
    baselineCount: baseline.count
  }
}

const leveragePct = (s, adoption) =>
  round(Math.cbrt(s.coverage * s.efficiency * adoption) * PERCENT)

const flowFields = (s) => ({
  flowRatio: s.flowRatio,
  flowAvailable: s.flowAvailable,
  copilotMedianCycleHours: s.copilotMedianCycleHours,
  baselineMedianCycleHours: s.baselineMedianCycleHours,
  baselineCount: s.baselineCount
})

function repoLeverage(repository, scopeRows, historyRows, portfolioBaseline) {
  const s = scoreFor(
    scopeRows,
    manualBaselineFor(historyRows, repository),
    portfolioBaseline
  )
  const sets = { all: new Set(), adopters: new Set() }
  for (const { m } of scopeRows) {
    addContributors(sets, m.byContributor)
  }
  const adoption = sets.all.size
    ? clamp01(sets.adopters.size / sets.all.size)
    : 0
  return {
    repository,
    name: shortRepoName(repository),
    leveragePct: leveragePct(s, adoption),
    coverage: pct(s.coverage),
    efficiency: pct(s.efficiency),
    adoption: pct(adoption),
    ...flowFields(s),
    baselineLocal: s.baselineLocal
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
  const rows = payloads.map((p) => {
    const m = computePrMetrics(p)
    return { ...historyRow(p, m), m }
  })
  // Reuse the rows when no separate history was passed.
  const historyRows =
    historyPayloads === payloads
      ? rows
      : historyPayloads.map((p) => historyRow(p, computePrMetrics(p)))

  const portfolioBaseline = manualBaselineFor(historyRows, null)
  const portfolio = scoreFor(rows, portfolioBaseline, portfolioBaseline)
  const contributors = selectContributorSummaries(payloads)
  const adopters = contributors.filter((c) => c.copilotAssisted > 0).length
  const portfolioAdoption = contributors.length
    ? clamp01(adopters / contributors.length)
    : 0

  const repos = Array.from(groupByRepository(rows))
    .map(([repository, scopeRows]) =>
      repoLeverage(repository, scopeRows, historyRows, portfolioBaseline)
    )
    .sort((a, b) => b.leveragePct - a.leveragePct)

  return {
    leveragePct: leveragePct(portfolio, portfolioAdoption),
    coverage: pct(portfolio.coverage),
    efficiency: pct(portfolio.efficiency),
    adoption: pct(portfolioAdoption),
    ...flowFields(portfolio),
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
  const totals = { totalCommits: 0, totalLinesTouched: 0 }
  for (const p of payloads) {
    const m = computePrMetrics(p)
    totals.totalCommits += m.totalCommits
    totals.totalLinesTouched += m.totalLinesTouched
  }

  const contributors = selectContributorSummaries(payloads)
  const adopters = contributors.filter((c) => c.copilotAssisted > 0).length
  const rework = selectRepoRework(payloads)
  const leverage = selectCopilotLeverage(payloads, historyPayloads)

  return {
    avgCycleHours: round(mean(cycles), 1),
    medianCycleHours: median(cycles),
    fastestCycleHours: cycles.length ? Math.min(...cycles) : 0,
    avgCommitSize: avgCommitSize(totals),
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
      ? round((adopters / contributors.length) * PERCENT, 1)
      : 0,
    adopters,
    contributorTotal: contributors.length,
    rebaseCommits: metrics.reduce((s, m) => s + m.rebaseCommits, 0),
    rebaseLines: metrics.reduce((s, m) => s + m.rebaseLines, 0)
  }
}
