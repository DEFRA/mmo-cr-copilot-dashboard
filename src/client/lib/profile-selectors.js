import { PERSONAS, personaForContributor } from './personas'
import {
  addContributors,
  clamp01,
  computePrMetrics,
  countedCommits,
  hoursBetween,
  mean,
  rate,
  round,
  shortRepoName
} from './selector-core.js'

const PERCENT = 100
const TARGET_CYCLE_H = 48
const TARGET_REWORK = 1
const PROFILE_AXES = [
  'Commit Assist',
  'Line Assist',
  'Adoption',
  'Delivery Speed',
  'Rework Control'
]

/**
 * Flattened, chronologically-ordered commit stream using each commit's actual
 * `committedAt` timestamp from the payload. Powers the live commit-level
 * insights chart and all time-based KPI selectors. Rebase/merge commits are
 * excluded — the stream tells the Copilot-vs-manual delivery story.
 */
export function selectCommitTimeline(payloads) {
  return payloads
    .flatMap((p) =>
      countedCommits(p).map(({ c, category }) => ({
        ...c,
        classification: category,
        repository: p.repository,
        repoName: shortRepoName(p.repository),
        prNumber: p.prNumber,
        committedAt: c.committedAt
      }))
    )
    .sort((a, b) => new Date(a.committedAt) - new Date(b.committedAt))
}

const emptyProfile = (repository) => ({
  repository,
  name: shortRepoName(repository),
  copilotCommits: 0,
  totalCommits: 0,
  copilotLines: 0,
  totalLines: 0,
  added: 0,
  deleted: 0,
  cycles: [],
  sets: { all: new Set(), adopters: new Set() }
})

function addToProfile(r, p) {
  const m = computePrMetrics(p)
  r.copilotCommits += m.copilotAssistedCommits
  r.totalCommits += m.totalCommits
  r.copilotLines += m.copilotAssistedLines
  r.totalLines += m.totalLinesTouched
  r.added += m.linesAdded
  r.deleted += m.linesDeleted
  const cyc = hoursBetween(p.firstCommitAt, p.lastCommitAt)
  if (cyc > 0) {
    r.cycles.push(cyc)
  }
  addContributors(r.sets, m.byContributor)
}

function profileValues(r) {
  const rework = r.added ? r.deleted / r.added : 0
  const { all, adopters } = r.sets
  return [
    rate(r.copilotCommits, r.totalCommits),
    rate(r.copilotLines, r.totalLines),
    all.size ? round((adopters.size / all.size) * PERCENT) : 0,
    round(PERCENT * (1 - clamp01(mean(r.cycles) / TARGET_CYCLE_H))),
    round(PERCENT * (1 - clamp01(rework / TARGET_REWORK)))
  ]
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
  const byRepo = new Map()
  for (const p of payloads) {
    const r = byRepo.get(p.repository) ?? emptyProfile(p.repository)
    byRepo.set(p.repository, r)
    addToProfile(r, p)
  }

  const repos = Array.from(byRepo.values())
    .map((r) => ({ name: r.name, key: r.repository, values: profileValues(r) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    indicators: PROFILE_AXES.map((name) => ({ name, max: PERCENT })),
    repos
  }
}

const emptyPersona = () => ({
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

function addContribution(agg, repository, author, c) {
  agg.repos.add(repository)
  agg.totalCommits += c.totalCommits
  agg.copilotAssistedCommits += c.copilotAssisted
  agg.totalLinesTouched += c.linesTouched
  agg.copilotAssistedLines += c.copilotAssistedLines
  agg.linesAdded += c.linesAdded
  agg.linesDeleted += c.linesDeleted
  agg.contributors.add(author)
  if (c.copilotAssisted > 0) {
    agg.adopters.add(author)
  }
}

function personaRow(persona, a) {
  return {
    id: persona.id,
    label: persona.label,
    icon: persona.icon,
    repoCount: a.repos.size,
    repoNames: Array.from(a.repos)
      .map(shortRepoName)
      .sort((x, y) => x.localeCompare(y)),
    prCount: a.prs.size,
    totalCommits: a.totalCommits,
    copilotAssistedCommits: a.copilotAssistedCommits,
    contributorCount: a.contributors.size,
    adopters: a.adopters.size,
    adoptionPct: rate(a.adopters.size, a.contributors.size),
    copilotAssistedRate: rate(a.copilotAssistedCommits, a.totalCommits),
    copilotAssistedLineRate: rate(a.copilotAssistedLines, a.totalLinesTouched),
    netLines: a.linesAdded - a.linesDeleted,
    avgCycleHours: round(mean(a.cycles), 1)
  }
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
  const byPersona = new Map(PERSONAS.map((p) => [p.id, emptyPersona()]))
  const aggFor = (id) => byPersona.get(id) ?? byPersona.get(PERSONAS[0].id)

  for (const p of payloads) {
    const cyc = hoursBetween(p.firstCommitAt, p.lastCommitAt)
    const personaIdsInPr = new Set()
    for (const [author, c] of computePrMetrics(p).byContributor) {
      if (c.totalCommits > 0) {
        const personaId = personaForContributor(author, mappingsByHandle)
        addContribution(aggFor(personaId), p.repository, author, c)
        personaIdsInPr.add(personaId)
      }
    }
    for (const personaId of personaIdsInPr) {
      const agg = aggFor(personaId)
      agg.prs.add(`${p.repository}#${p.prNumber}`)
      if (cyc > 0) {
        agg.cycles.push(cyc)
      }
    }
  }

  return PERSONAS.map((persona) =>
    personaRow(persona, byPersona.get(persona.id))
  )
}
