/**
 * Hash routes for every view. Project-scoped views carry the project slug so a
 * link is shareable: `#/projects/{slug}/repository/{repo}/pull/{n}`.
 */

const GLOBAL_PATHS = {
  settings: 'settings',
  adminProjects: 'admin/projects',
  accessibility: 'accessibility',
  cookies: 'cookies',
  privacy: 'privacy'
}

const LIST_PATHS = {
  pullRequests: 'pull-requests',
  contributors: 'contributors',
  delivery: 'delivery',
  leverage: 'leverage',
  copilotUsage: 'copilot-usage'
}

const OVERVIEW_SECTIONS = new Set(['repositories'])
const TICKET_KEY = /^[A-Z][A-Z0-9_]+-\d+$/

const enc = encodeURIComponent

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const isGlobalLevel = (level) => level in GLOBAL_PATHS

function projectPath(nav) {
  const repo = nav.repository && `repository/${enc(nav.repository)}`
  switch (nav.level) {
    case 'repo':
      return repo
    case 'repoCycle':
      return `${repo}/cycle-time`
    case 'pr':
      return `${repo}/pull/${nav.prNumber}`
    case 'contributor':
      return nav.repository
        ? `${repo}/contributor/${enc(nav.contributor)}`
        : `contributor/${enc(nav.contributor)}`
    case 'ticket':
      return `ticket/${enc(nav.ticket)}`
    default:
      if (LIST_PATHS[nav.level]) return LIST_PATHS[nav.level]
      return nav.section ? `overview/${nav.section}` : 'overview'
  }
}

export function toHash(nav) {
  if (isGlobalLevel(nav.level)) return `#/${GLOBAL_PATHS[nav.level]}`
  const prefix = nav.project ? `#/projects/${enc(nav.project)}` : '#'
  return `${prefix}/${projectPath(nav)}`
}

function parseRepository([repository, kind, value, ...rest]) {
  if (!repository || rest.length > 0) return null
  if (kind === undefined) return { level: 'repo', repository }
  if (kind === 'cycle-time' && value === undefined) {
    return { level: 'repoCycle', repository }
  }
  if (kind === 'pull' && /^[1-9]\d*$/.test(value ?? '')) {
    return { level: 'pr', repository, prNumber: Number(value) }
  }
  if (kind === 'contributor' && value) {
    return { level: 'contributor', contributor: value, repository }
  }
  return null
}

function parseProjectPath(segments) {
  const [head, ...rest] = segments
  if (head === undefined || head === 'overview') {
    if (rest.length === 0) return { level: 'overview' }
    if (rest.length === 1 && OVERVIEW_SECTIONS.has(rest[0])) {
      return { level: 'overview', section: rest[0] }
    }
    return null
  }
  if (head === 'repository') return parseRepository(rest)
  if (head === 'contributor' && rest.length === 1 && rest[0]) {
    return { level: 'contributor', contributor: rest[0] }
  }
  if (head === 'ticket' && rest.length === 1 && TICKET_KEY.test(rest[0])) {
    return { level: 'ticket', ticket: rest[0] }
  }
  const list = Object.keys(LIST_PATHS).find((l) => LIST_PATHS[l] === head)
  return list && rest.length === 0 ? { level: list } : null
}

/** Parses a location hash; anything unrecognised is the project overview. */
export function fromHash(hash = '') {
  let raw = String(hash).replace(/^#/, '')
  // Some browsers hand back the whole hash percent-encoded (`#%2Foverview`).
  if (/^%2F/i.test(raw)) raw = safeDecode(raw)
  const path = raw.replace(/^\/+/, '').replace(/\/+$/, '')

  const global = Object.keys(GLOBAL_PATHS).find(
    (level) => GLOBAL_PATHS[level] === path
  )
  if (global) return { level: global }

  let segments = path === '' ? [] : path.split('/').map(safeDecode)
  let project
  if (segments[0] === 'projects' && segments[1]) {
    project = segments[1]
    segments = segments.slice(2)
  }

  const nav = parseProjectPath(segments) ?? { level: 'overview' }
  return project ? { ...nav, project } : nav
}
