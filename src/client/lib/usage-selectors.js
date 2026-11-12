// ── AI code survival and Copilot usage ──────────────────────────────────────
import { COPILOT_ASSISTED } from './classification'
import { commitsOf, isFiniteNum, median, num, round } from './selector-core.js'

const PERCENT = 100
const DEFAULT_CHURN_WINDOW_DAYS = 21
// Requests committed from 19:00 or before 07:00 local time count as out of hours.
const EVENING_HOUR = 19
const MORNING_HOUR = 7
const MULTI_MODEL = 2

const CHURN_ORIGINS = [
  { id: 'aiAgent', label: 'Agent' },
  { id: 'aiCompletion', label: 'Completion' },
  { id: 'aiChat', label: 'Chat' }
]

const finiteOrNull = (n) => (isFiniteNum(n) ? n : null)
const shareOf = (part, whole, dp = 1) =>
  whole > 0 ? round((part / whole) * PERCENT, dp) : null

function churnOrigin(byOrigin, { id, label }) {
  const origin = byOrigin?.[id]
  return {
    id,
    label,
    merged: num(origin?.merged),
    surviving: num(origin?.surviving),
    churnPercent: finiteOrNull(origin?.churnPercent)
  }
}

/**
 * AI code churn (CCR_N, docs/metrics.md) from the backend churn response.
 * Unavailable until the survival workflow has measured at least one PR.
 */
export function selectAiCodeChurnRate(churn) {
  if (churn?.available !== true) {
    return {
      available: false,
      windowDays: Number(churn?.windowDays) || DEFAULT_CHURN_WINDOW_DAYS,
      reason: typeof churn?.reason === 'string' ? churn.reason : null,
      prCount: num(churn?.prCount)
    }
  }
  return {
    available: true,
    windowDays: num(churn.windowDays),
    percent: num(churn.churnRatePercent),
    humanPercent: finiteOrNull(churn.humanChurnPercent),
    penaltyApplied: churn.penaltyApplied === true,
    multiplier: finiteOrNull(churn.effectiveMultiplier) ?? 1,
    prCount: num(churn.prCount),
    aiLinesMerged: num(churn.aiLinesMerged),
    aiLinesSurviving: num(churn.aiLinesSurviving),
    byOrigin: CHURN_ORIGINS.map((o) => churnOrigin(churn.byOrigin, o))
  }
}

const hasUsage = (attribution) =>
  attribution?.source === 'extension' &&
  Array.isArray(attribution.usage?.models)

/** Extension-attributed commits that carry Copilot usage, with that usage. */
const usageCommits = (payload) =>
  commitsOf(payload)
    .filter((commit) => hasUsage(commit?.attribution))
    .map((commit) => ({ commit, usage: commit.attribution.usage }))

// GitHub AI credits recorded by the extension; null means not recorded (never derived from tokens).
const creditsOf = (m) =>
  isFiniteNum(m?.credits) && m.credits >= 0 ? m.credits : null

const aiLinesOf = (a) =>
  num(a.aiCompletionLines) + num(a.aiChatLines) + num(a.aiAgentLines)

const writtenByCopilot = (commit) =>
  commit?.attribution?.source === 'extension' &&
  aiLinesOf(commit.attribution) > 0

const isAssistedPr = (payload) =>
  commitsOf(payload).some(
    (commit) =>
      commit?.classification === COPILOT_ASSISTED || writtenByCopilot(commit)
  )

/** Adds one PR's model usage to `byModel`; returns its credits, or null if none recorded. */
function accruePrUsage(byModel, payload) {
  let credits = null
  const models = usageCommits(payload)
    .flatMap(({ usage }) => usage.models)
    .filter((m) => typeof m?.model === 'string')
  for (const m of models) {
    const entry = byModel.get(m.model) ?? {
      model: m.model,
      requests: 0,
      credits: 0,
      recorded: false
    }
    entry.requests += num(m.requests)
    const spent = creditsOf(m)
    if (spent !== null) {
      entry.credits += spent
      entry.recorded = true
      credits = (credits ?? 0) + spent
    }
    byModel.set(m.model, entry)
  }
  return { used: models.length > 0, credits }
}

const byCreditsThenRequests = (a, b) =>
  (b.credits ?? -1) - (a.credits ?? -1) ||
  b.requests - a.requests ||
  a.model.localeCompare(b.model)

const sum = (values) => values.reduce((s, v) => s + v, 0)

/**
 * Copilot model usage across pull requests, from the extension's per-commit
 * attribution: model requests and the GitHub AI credits recorded on developers'
 * machines. Team and model level only; never per person. Coverage says how many
 * Copilot-assisted PRs carry usage, and how many of those recorded credits.
 */
export function selectCopilotUsage(payloads) {
  const byModel = new Map()
  const perPrCredits = []
  let prsWithUsage = 0
  let assistedPrs = 0

  for (const payload of payloads ?? []) {
    const { used, credits } = accruePrUsage(byModel, payload)
    assistedPrs += isAssistedPr(payload) ? 1 : 0
    prsWithUsage += used ? 1 : 0
    if (credits !== null) {
      perPrCredits.push(credits)
    }
  }

  const models = [...byModel.values()]
    .map((m) => ({
      model: m.model,
      requests: round(m.requests, 2),
      credits: m.recorded ? round(m.credits, 4) : null
    }))
    .sort(byCreditsThenRequests)
  const hasCredits = perPrCredits.length > 0
  return {
    models,
    prsWithUsage,
    prsWithCredits: perPrCredits.length,
    assistedPrs,
    coveragePercent: shareOf(prsWithUsage, assistedPrs),
    totalCredits: hasCredits ? round(sum(perPrCredits), 4) : null,
    medianCreditsPerPr: hasCredits ? round(median(perPrCredits), 4) : null
  }
}

export const RESERVED_USAGE_MODELS = new Set(['other', 'unknown'])
export const SUPERLATIVE_MIN_PRS = 2
export const BEST_VALUE_MIN_REQUESTS = 5
export const NIGHT_OWL_MIN_REQUESTS = 5

const cappedPercent = (part, whole) =>
  whole > 0 ? Math.min(PERCENT, round((part / whole) * PERCENT, 1)) : null

const isOutOfHours = (date) =>
  date.getHours() >= EVENING_HOUR || date.getHours() < MORNING_HOUR

const emptyModel = (model) => ({
  model,
  requests: 0,
  credits: 0,
  recorded: false,
  pricedRequests: 0,
  prs: new Set(),
  outOfHoursRequests: 0,
  timedRequests: 0
})

/** Adds one model's usage on one commit to its running entry. */
function accrueModel(entry, m, prKey, committedAt) {
  const requests = num(m.requests)
  const timed = !Number.isNaN(committedAt.getTime())
  entry.requests += requests
  entry.prs.add(prKey)
  const spent = creditsOf(m)
  if (spent !== null) {
    entry.credits += spent
    entry.pricedRequests += requests
    entry.recorded = true
  }
  if (timed) {
    entry.timedRequests += requests
  }
  if (timed && isOutOfHours(committedAt)) {
    entry.outOfHoursRequests += requests
  }
}

const namedModels = (models) =>
  models.filter((m) => typeof m?.model === 'string' && m.model !== '')

function accrueUsageModels(payloads) {
  const byModel = new Map()
  const prModels = new Map()

  for (const payload of payloads ?? []) {
    const prKey = `${payload?.repository}#${payload?.prNumber}`
    const seen = prModels.get(prKey) ?? new Set()
    for (const { commit, usage } of usageCommits(payload)) {
      const committedAt = new Date(commit.committedAt)
      for (const m of namedModels(usage.models)) {
        const entry = byModel.get(m.model) ?? emptyModel(m.model)
        accrueModel(entry, m, prKey, committedAt)
        byModel.set(m.model, entry)
        seen.add(m.model)
      }
    }
    const tracked = [...seen].filter((id) => !RESERVED_USAGE_MODELS.has(id))
    if (tracked.length > 0) {
      prModels.set(prKey, new Set(tracked))
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
      'biggest-spender',
      'creditShare',
      (m) => m.credits > 0,
      (m) => m.creditShare,
      1
    ),
    pick(
      'best-value',
      'creditsPerRequest',
      (m) => m.requests >= BEST_VALUE_MIN_REQUESTS,
      (m) => m.creditsPerRequest,
      -1
    ),
    pick(
      'night-owl',
      'outOfHoursShare',
      (m) => m.requests >= NIGHT_OWL_MIN_REQUESTS && m.outOfHoursShare > 0,
      (m) => m.outOfHoursShare,
      1
    )
  ]
  if (variety.distinctModels >= MULTI_MODEL) {
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

function modelRow(m, grand) {
  const creditShare = m.recorded
    ? (shareOf(m.credits, grand.credits) ?? 0)
    : null
  return {
    model: m.model,
    requests: round(m.requests, 2),
    credits: m.recorded ? round(m.credits, 4) : null,
    requestShare: shareOf(m.requests, grand.requests) ?? 0,
    creditShare,
    creditsPerRequest:
      m.pricedRequests > 0 ? round(m.credits / m.pricedRequests, 4) : null,
    outOfHoursShare: cappedPercent(m.outOfHoursRequests, m.timedRequests),
    prCount: m.prs.size,
    reserved: RESERVED_USAGE_MODELS.has(m.model),
    rank: null
  }
}

const byRequestsThenCredits = (a, b) =>
  b.requests - a.requests ||
  (b.credits ?? -1) - (a.credits ?? -1) ||
  a.model.localeCompare(b.model)

function favouriteOf(named) {
  const lead = named.find((m) => m.requests > 0) ?? named[0]
  if (!lead) {
    return null
  }
  const runnerUp = named[named.indexOf(lead) + 1]
  return {
    model: lead.model,
    requests: lead.requests,
    requestShare: lead.requestShare,
    prCount: lead.prCount,
    leadPoints: round(lead.requestShare - (runnerUp?.requestShare ?? 0), 1)
  }
}

function varietyOf(named, prModels, prsWithUsage) {
  const namedRequests = sum(named.map((m) => m.requests))
  const hhi = sum(named.map((m) => (m.requests / (namedRequests || 1)) ** 2))
  const multiModelPrs = [...prModels.values()].filter(
    (set) => set.size >= MULTI_MODEL
  ).length
  return {
    distinctModels: named.length,
    effectiveModels: namedRequests > 0 ? round(1 / hhi, 1) : null,
    multiModelPrShare: shareOf(multiModelPrs, prsWithUsage)
  }
}

function totalsOf(entries, grand) {
  const recorded = entries.some((m) => m.recorded)
  const pricedRequests = sum(entries.map((m) => m.pricedRequests))
  return {
    requests: round(grand.requests, 2),
    credits: recorded ? round(grand.credits, 4) : null,
    creditsPerRequest:
      pricedRequests > 0 ? round(grand.credits / pricedRequests, 4) : null
  }
}

/**
 * Copilot usage insights at team and model level, in requests and recorded
 * GitHub AI credits. Never reads authors or contributor breakdowns, so nothing
 * here can identify a person.
 */
export function selectCopilotInsights(payloads) {
  const usage = selectCopilotUsage(payloads)
  const { byModel, prModels } = accrueUsageModels(payloads)

  const entries = [...byModel.values()]
  const grand = {
    requests: sum(entries.map((m) => m.requests)),
    credits: sum(entries.map((m) => m.credits))
  }
  const models = entries
    .map((m) => modelRow(m, grand))
    .sort(byRequestsThenCredits)
  const named = models.filter((m) => !m.reserved)
  named.forEach((m, i) => {
    m.rank = i + 1
  })
  const variety = varietyOf(named, prModels, usage.prsWithUsage)

  return {
    hasUsage: models.length > 0,
    coverage: {
      prsWithUsage: usage.prsWithUsage,
      prsWithCredits: usage.prsWithCredits,
      assistedPrs: usage.assistedPrs,
      coveragePercent: usage.coveragePercent
    },
    medianCreditsPerPr: usage.medianCreditsPerPr,
    totals: totalsOf(entries, grand),
    models,
    favourite: favouriteOf(named),
    variety,
    superlatives: buildSuperlatives(named, variety)
  }
}

/** Top `limit` entries by `key`, the rest merged into one 'Other models' entry. */
export function foldModels(models, limit, key) {
  const sorted = [...(models ?? [])].sort((a, b) => num(b[key]) - num(a[key]))
  if (sorted.length <= limit) {
    return sorted
  }
  const rest = sorted.slice(limit)
  return [
    ...sorted.slice(0, limit),
    { model: 'Other models', [key]: sum(rest.map((m) => num(m[key]))) }
  ]
}

export const OTHER_MODELS_ID = 'other'

/**
 * Each model's share of Copilot requests, largest first, with the tail folded
 * into 'Other models' past `limit`. Models without requests are left out.
 */
export function selectModelRequestShares(models, limit = 5) {
  const folded = foldModels(
    (models ?? []).filter((m) => num(m.requests) > 0),
    limit,
    'requests'
  )
  const total = sum(folded.map((m) => num(m.requests)))
  // The id keeps the folded bucket apart from a model that is itself called 'Other models'.
  return folded.map((m, i) => ({
    id: i === limit ? OTHER_MODELS_ID : `model:${m.model}`,
    model: m.model,
    requests: num(m.requests),
    share: round((num(m.requests) / total) * PERCENT, 1)
  }))
}
