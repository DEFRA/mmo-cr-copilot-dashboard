// Which Jira statuses belong to which delivery stage. Limits and messages
// mirror the backend (ADR 0011); the backend stays the authority.
import { formatDate } from './onboarding.js'

export const MAX_STATUS_LENGTH = 60
export const MAX_STATUSES_PER_STAGE = 40
export const MAX_STATUSES_TOTAL = 150

const SOURCES = new Set(['project', 'detected', 'default'])
const KINDS = new Set(['todo', 'active', 'waiting', 'done', 'excluded'])
// eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

export const normaliseStatus = (name) =>
  String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

export const tidyStatus = (name) =>
  String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')

export const STAGE_HINT = {
  todo: 'Required. A ticket starts when it first moves out of one of these statuses.',
  active: 'Optional. Time in these statuses counts as active work.',
  waiting: 'Optional. Time in these statuses counts as waiting.',
  done: 'Required. This is your Definition of Done: a ticket is delivered when it moves into one of these statuses. Put statuses that close a ticket without delivering it, such as Won’t Do, in Cancelled.',
  excluded:
    'Optional. Tickets that end in these statuses are left out of delivery metrics.'
}

export const DEFINITION_OF_DONE = 'Definition of Done'

/** The name a stage is shown under; the done stage is the Definition of Done. */
export const stageTitle = (stage) =>
  stage?.kind === 'done' ? DEFINITION_OF_DONE : (stage?.label ?? '')

/** Statuses in the done stage, in saved order; empty when there is none. */
export const definitionOfDone = (stages) =>
  (stages ?? []).filter((s) => s.kind === 'done').flatMap((s) => s.statuses)

const isStringList = (value) =>
  Array.isArray(value) && value.every((s) => typeof s === 'string')

const toIsoOrNull = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null

/** The workflow response, checked; null when it cannot be shown. */
export function toWorkflow(raw) {
  if (!raw || !SOURCES.has(raw.source) || !Number.isInteger(raw.version)) {
    return null
  }
  if (!Array.isArray(raw.stages) || raw.stages.length === 0) {
    return null
  }
  const stages = raw.stages.filter(
    (s) =>
      typeof s?.id === 'string' &&
      typeof s.label === 'string' &&
      KINDS.has(s.kind) &&
      isStringList(s.statuses)
  )
  if (stages.length !== raw.stages.length) {
    return null
  }
  const suggestions = Object.fromEntries(
    Object.entries(raw.suggestions ?? {}).filter(([, list]) =>
      isStringList(list)
    )
  )
  return {
    source: raw.source,
    version: raw.version,
    updatedAt: toIsoOrNull(raw.updatedAt),
    updatedBy:
      typeof raw.updatedBy?.name === 'string'
        ? { name: raw.updatedBy.name }
        : null,
    detectedAt: toIsoOrNull(raw.detectedAt),
    detectedCount: Number.isInteger(raw.detectedCount) ? raw.detectedCount : 0,
    stages: stages.map(({ id, label, kind, required, statuses }) => ({
      id,
      label,
      kind,
      required: required === true,
      statuses: [...statuses]
    })),
    suggestions
  }
}

/** One sentence saying where the workflow the metrics use came from. */
export function workflowSourceText(workflow) {
  if (workflow?.source === 'project') {
    const by = workflow.updatedBy?.name ? ` by ${workflow.updatedBy.name}` : ''
    const on = workflow.updatedAt ? ` on ${formatDate(workflow.updatedAt)}` : ''
    return `Saved${by}${on}.`
  }
  if (workflow?.source === 'detected') {
    const on = workflow.detectedAt
      ? ` on ${formatDate(workflow.detectedAt)}`
      : ''
    return `Detected from Jira${on}. You can change it and save.`
  }
  return 'Using the standard statuses. Save your own to change them.'
}

/** The stage holding a status, matched without case or spacing; or null. */
export function stageOf(stages, name) {
  const key = normaliseStatus(name)
  return (
    stages.find((stage) =>
      stage.statuses.some((status) => normaliseStatus(status) === key)
    ) ?? null
  )
}

/** Why `text` cannot be added to a stage, or null when it can. */
export function addStatusError(stages, stageId, text) {
  const name = tidyStatus(text)
  const stage = stages.find((s) => s.id === stageId)
  if (!name) {
    return 'Enter a status'
  }
  if (name.length > MAX_STATUS_LENGTH) {
    return `Status must be ${MAX_STATUS_LENGTH} characters or fewer`
  }
  if (CONTROL_CHARACTER.test(name)) {
    return 'Status must only include letters, numbers, spaces and punctuation'
  }
  const holder = stageOf(stages, name)
  if (holder && holder.id === stageId) {
    return `‘${name}’ is already in ${stageTitle(holder)}`
  }
  if (holder) {
    return `‘${name}’ is already in ${stageTitle(holder)}. A status can only be in one stage.`
  }
  if (stage && stage.statuses.length >= MAX_STATUSES_PER_STAGE) {
    return `${stageTitle(stage)} can have up to ${MAX_STATUSES_PER_STAGE} statuses`
  }
  const total = stages.reduce((n, s) => n + s.statuses.length, 0)
  if (total >= MAX_STATUSES_TOTAL) {
    return `A workflow can have at most ${MAX_STATUSES_TOTAL} statuses`
  }
  return null
}

/** Errors by stage id for the rules checked on save. */
export function validateWorkflow(stages) {
  const errors = {}
  for (const stage of stages) {
    if (stage.required && stage.statuses.length === 0) {
      errors[stage.id] = `Add at least one status to ${stageTitle(stage)}`
    }
  }
  return errors
}

// Case is kept: the saved spelling is what the stage shows and stores.
const stageKeys = (stages) =>
  new Map(
    (stages ?? []).map((s) => [
      s.id,
      s.statuses
        .map(tidyStatus)
        .sort((a, b) => a.localeCompare(b))
        .join('\n')
    ])
  )

/** Whether the edited stages differ from the saved ones, ignoring order and spacing. */
export function isWorkflowDirty(stages, saved) {
  const now = stageKeys(stages)
  const before = stageKeys(saved)
  if (now.size !== before.size) {
    return true
  }
  for (const [id, key] of now) {
    if (before.get(id) !== key) {
      return true
    }
  }
  return false
}

export const toWorkflowPayload = (stages, version) => ({
  version,
  stages: stages.map(({ id, statuses }) => ({ id, statuses: [...statuses] }))
})

/** Names to offer for a stage: its suggestions, then Jira's, minus any already in a stage. */
export function statusOptions(stages, stageId, suggestions, detected = []) {
  const used = new Set(
    stages.flatMap((s) => s.statuses.map((name) => normaliseStatus(name)))
  )
  const seen = new Set()
  const options = []
  for (const name of [...(suggestions?.[stageId] ?? []), ...detected]) {
    const tidy = tidyStatus(name)
    const key = normaliseStatus(tidy)
    if (!tidy || used.has(key) || seen.has(key)) {
      continue
    }
    seen.add(key)
    options.push(tidy)
  }
  return options
}
