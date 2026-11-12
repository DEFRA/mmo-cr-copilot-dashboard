/**
 * Shared guards, helpers and the per-PR metric calculation every selector
 * module builds on. Kept framework-free so they are trivially testable.
 */
import {
  COPILOT_ASSISTED,
  EXCLUDED_CLASSIFICATIONS,
  HUMAN_AUTHORED,
  REBASE_MERGE_REGEX,
  isExcludedClassification
} from './classification'

const PERCENT = 100
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
export const HOUR_MS = 1000 * MINUTES_PER_HOUR * MINUTES_PER_HOUR
// Commit assist rate (%) at or above which a PR is "Copilot-led".
export const COPILOT_LED_THRESHOLD = 50

export const round = (n, dp = 2) => {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

export const rate = (part, whole) =>
  whole > 0 ? round((part / whole) * PERCENT) : 0

export const clamp01 = (n) => Math.max(0, Math.min(1, n))

// ── Validation guards ────────────────────────────────────────────────────────
// The dashboard must never break on partial data. These guards let callers skip
// an incomplete commit or PR block instead of plotting NaN/undefined.

export const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n)
export const isValidDateStr = (s) =>
  typeof s === 'string' && !Number.isNaN(Date.parse(s))
/** Coerce to a finite number, else 0 — for defensive summing. */
export const num = (n) => (isFiniteNum(n) ? n : 0)

export const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

export const median = (nums) => {
  if (!nums.length) {
    return 0
  }
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2)
}

export const commitsOf = (payload) =>
  Array.isArray(payload?.commitBreakdown) ? payload.commitBreakdown : []

export function shortRepoName(repository) {
  const parts = repository.split('/')
  return parts.at(-1)
}

/**
 * UI display label for a commit classification. The underlying data keeps the
 * canonical `'Non-flagged'` value; only the presentation reads 'Human-authored'.
 */
export function classificationLabel(classification) {
  return classification === 'Non-flagged' ? HUMAN_AUTHORED : classification
}

/** The payload as seen inside the window: only its commits there, or null. */
function windowedPayload(p, inWindow) {
  const commits = commitsOf(p)
  const dated = commits.filter((c) => isValidDateStr(c?.committedAt))
  if (dated.length === 0) {
    const stamp = p.lastCommitAt ?? p.calculatedAt ?? p.firstCommitAt
    return !stamp || inWindow(stamp) ? p : null
  }
  const kept = dated.filter((c) => inWindow(c.committedAt))
  if (kept.length === 0) {
    return null
  }
  return kept.length === commits.length ? p : { ...p, commitBreakdown: kept }
}

const boundAt = (value, fallback) =>
  value == null ? fallback : new Date(value).getTime()

/**
 * Restricts payloads to a [start, end) time window by commit time, so a
 * backfill (one `calculatedAt` for every PR) still lands in the right sprints.
 * A PR whose commits span sprints appears in each, carrying only the commits
 * of that window; one without commit dates falls back to its last activity.
 */
export function filterPayloadsByWindow(payloads, start, end) {
  if (start == null && end == null) {
    return payloads
  }
  const s = boundAt(start, -Infinity)
  const e = boundAt(end, Infinity)
  const inWindow = (stamp) => {
    const t = new Date(stamp).getTime()
    return t >= s && t < e
  }
  return payloads.map((p) => windowedPayload(p, inWindow)).filter(Boolean)
}

/** Epoch ms of a PR's latest commit (in the current window), else its last recorded activity. */
export function payloadActivityTime(p) {
  const latest = Math.max(
    -Infinity,
    ...commitsOf(p)
      .map((c) => Date.parse(c?.committedAt))
      .filter(Number.isFinite)
  )
  if (Number.isFinite(latest)) {
    return latest
  }
  const t = Date.parse(p.lastCommitAt ?? p.calculatedAt)
  return Number.isFinite(t) ? t : 0
}

export const byActivityDesc = (a, b) =>
  payloadActivityTime(b) - payloadActivityTime(a)
export const byActivityAsc = (a, b) =>
  payloadActivityTime(a) - payloadActivityTime(b)

/**
 * Classifications the charts understand. Excluded kinds are listed so they
 * survive this filter and can be reported as set aside.
 */
const KNOWN_CLASSIFICATIONS = new Set([
  COPILOT_ASSISTED,
  HUMAN_AUTHORED,
  ...EXCLUDED_CLASSIFICATIONS
])
const COMMIT_NUMBERS = ['linesAdded', 'linesDeleted', 'linesTouched']
const SUMMARY_NUMBERS = [
  'totalCommits',
  'copilotAssistedCommits',
  'humanAuthoredCommits',
  'copilotAssistedRate',
  'copilotAssistedLineRate',
  'totalLinesTouched',
  'copilotAssistedLines',
  'humanAuthoredLines'
]

const isNonEmptyString = (s) => typeof s === 'string' && s.length > 0
const allFinite = (obj, keys) => keys.every((k) => isFiniteNum(obj[k]))

/** True when a commit has every field the charts rely on. */
export function isPlottableCommit(c) {
  return (
    c != null &&
    isNonEmptyString(c.commit) &&
    isValidDateStr(c.committedAt) &&
    KNOWN_CLASSIFICATIONS.has(c.classification) &&
    allFinite(c, COMMIT_NUMBERS)
  )
}

/**
 * True when a pull request has been merged. Gates the commit-log
 * classification editor: an open PR is re-analysed on every push, so a manual
 * correction there would be overwritten.
 */
export function isMergedPayload(p) {
  return isValidDateStr(p?.prMergedAt)
}

const hasBreakdowns = (p) =>
  Array.isArray(p.contributorBreakdown) && Array.isArray(p.commitBreakdown)

/** True when a PR payload has the summary + breakdown shape the charts need. */
export function isPlottablePayload(p) {
  return (
    p != null &&
    isNonEmptyString(p.repository) &&
    isFiniteNum(p.prNumber) &&
    p.summary != null &&
    allFinite(p.summary, SUMMARY_NUMBERS) &&
    hasBreakdowns(p)
  )
}

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
  if (REBASE_MERGE_REGEX.test((commit.subject ?? '').trim())) {
    return 'Rebase'
  }
  return classificationLabel(commit.classification)
}

/** A payload's plottable commits that count, each with its effective classification. */
export const countedCommits = (payload) =>
  commitsOf(payload)
    .filter(isPlottableCommit)
    .map((c) => ({ c, category: effectiveClassification(c) }))
    .filter(({ category }) => !isExcludedClassification(category))

/** PRs for a single repository, newest first. */
export function selectRepoPRs(payloads, repository) {
  return payloads
    .filter((p) => p.repository === repository)
    .slice()
    .sort(byActivityDesc)
}

/** Adds each contributor with counted commits to `sets.all`, adopters to `sets.adopters`. */
export function addContributors(sets, byContributor) {
  for (const [author, c] of byContributor) {
    if (c.totalCommits > 0) {
      sets.all.add(author)
    }
    if (c.totalCommits > 0 && c.copilotAssisted > 0) {
      sets.adopters.add(author)
    }
  }
}

const emptyTotals = () => ({
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
})

const emptyContributor = (contributor) => ({
  contributor,
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

// Excluded commits are counted apart; authors seen only on them are never registered.
function tallyExcluded(m, byContributor, c, kind) {
  if (kind === 'Dependabot') {
    m.dependabotCommits += 1
    m.dependabotLines += num(c.linesTouched)
  } else {
    m.rebaseCommits += 1
    m.rebaseLines += num(c.linesTouched)
  }
  const prior = byContributor.get(c.author ?? 'Unknown')
  if (prior) {
    prior.rebase += 1
  }
}

function tallyCounted(m, agg, c, kind) {
  const touched = num(c.linesTouched)
  const added = num(c.linesAdded)
  const deleted = num(c.linesDeleted)
  m.totalCommits += 1
  m.totalLinesTouched += touched
  m.linesAdded += added
  m.linesDeleted += deleted
  agg.totalCommits += 1
  agg.linesAdded += added
  agg.linesDeleted += deleted
  agg.linesTouched += touched
  agg.netLines += added - deleted
  if (kind === COPILOT_ASSISTED) {
    m.copilotAssistedCommits += 1
    m.copilotAssistedLines += touched
    m.copilotLinesAdded += added
    m.copilotLinesDeleted += deleted
    agg.copilotAssisted += 1
    agg.copilotAssistedLines += touched
  } else {
    m.humanAuthoredCommits += 1
    m.humanAuthoredLines += touched
    m.humanLinesAdded += added
    m.humanLinesDeleted += deleted
    agg.humanAuthored += 1
    agg.humanAuthoredLines += touched
  }
}

const lineCount = (n) => n || 0

/** Share of extension-attributed lines written by Copilot, or null without any. */
function extensionAiShare(commits) {
  let aiLines = 0
  let totalLines = 0
  for (const { attribution: a } of commits) {
    if (a?.source === 'extension') {
      const ai =
        lineCount(a.aiCompletionLines) +
        lineCount(a.aiChatLines) +
        lineCount(a.aiAgentLines)
      aiLines += ai
      totalLines += ai + lineCount(a.pastedLines) + lineCount(a.typedLines)
    }
  }
  return totalLines > 0
    ? Number(((aiLines / totalLines) * PERCENT).toFixed(2))
    : null
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
  const m = emptyTotals()
  const byContributor = new Map()
  const counted = []

  for (const c of commitsOf(payload).filter(isPlottableCommit)) {
    const kind = effectiveClassification(c)
    if (isExcludedClassification(kind)) {
      tallyExcluded(m, byContributor, c, kind)
    } else {
      const author = c.author ?? 'Unknown'
      if (!byContributor.has(author)) {
        byContributor.set(author, emptyContributor(author))
      }
      counted.push(c)
      tallyCounted(m, byContributor.get(author), c, kind)
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
    aiLineSharePercent: extensionAiShare(counted),
    byContributor
  }
}

/** Hours between two ISO timestamps (0 when either is missing). */
export function hoursBetween(a, b) {
  if (!a || !b) {
    return 0
  }
  return round((new Date(b) - new Date(a)) / HOUR_MS)
}

/** Human-friendly duration for a number of hours. */
export function formatDuration(hours) {
  if (hours == null || Number.isNaN(hours)) {
    return '—'
  }
  if (hours < 1) {
    return `${Math.round(hours * MINUTES_PER_HOUR)}m`
  }
  if (hours < HOURS_PER_DAY) {
    return `${round(hours, 1)}h`
  }
  const days = Math.floor(hours / HOURS_PER_DAY)
  const rem = Math.round(hours % HOURS_PER_DAY)
  return rem ? `${days}d ${rem}h` : `${days}d`
}

/** Average lines touched per counted commit, to one decimal place. */
export const avgCommitSize = (m) =>
  m.totalCommits ? round(m.totalLinesTouched / m.totalCommits, 1) : 0
