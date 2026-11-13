import { shortRepoName } from '../lib/selectors'
import { isGlobalLevel } from '../lib/routes'

export const SERVICE_NAME = 'Copilot Delivery Insights'
export const PROJECT_NAME = 'MMO Catch Recording'

// Service-wide pages with no hero, breadcrumbs or period filter.
export const PLAIN_PAGES = new Set([
  'accessibility',
  'adminProjects',
  'cookies',
  'help',
  'onboarding',
  'privacy'
])

// Service navigation and footer ids, and the page each one opens.
export const TOP_LEVEL = {
  overview: { level: 'overview' },
  repositories: { level: 'overview', section: 'repositories' },
  'pull-requests': { level: 'pullRequests' },
  contributors: { level: 'contributors' },
  delivery: { level: 'delivery' },
  settings: { level: 'settings' },
  onboarding: { level: 'onboarding' },
  help: { level: 'help' },
  accessibility: { level: 'accessibility' },
  cookies: { level: 'cookies' },
  privacy: { level: 'privacy' }
}

const NAV_LABELS = [
  ['overview', 'Overview'],
  ['repositories', 'Repositories'],
  ['pull-requests', 'Pull requests'],
  ['contributors', 'Contributors'],
  ['delivery', 'Delivery'],
  ['settings', 'Settings']
]
const ONBOARDING_LABEL = ['onboarding', 'Onboarding']
const HELP_LABEL = ['help', 'Help']

// The service navigation item each page sits under.
const NAV_FOR_LEVEL = {
  pullRequests: 'pull-requests',
  contributors: 'contributors',
  contributor: 'contributors',
  delivery: 'delivery',
  ticket: 'delivery',
  settings: 'settings',
  adminProjects: 'settings',
  onboarding: 'onboarding',
  help: 'help'
}

export function activeNavId(nav) {
  if (nav.section === 'repositories') {
    return 'repositories'
  }
  if (Object.hasOwn(NAV_FOR_LEVEL, nav.level)) {
    return NAV_FOR_LEVEL[nav.level]
  }
  return PLAIN_PAGES.has(nav.level) ? null : 'overview'
}

export const withProject = (nav, slug) =>
  isGlobalLevel(nav.level) || nav.project || !slug
    ? nav
    : { ...nav, project: slug }

/** Service navigation items; Delivery needs Jira and Onboarding an admin. */
export const navigationItems = ({ jiraConnected, isAdmin, slug, toHash }) =>
  [
    ...NAV_LABELS.filter(([id]) => id !== 'delivery' || jiraConnected),
    ...(isAdmin ? [ONBOARDING_LABEL] : []),
    HELP_LABEL
  ].map(([id, label]) => ({
    id,
    label,
    href: toHash(withProject(TOP_LEVEL[id], slug))
  }))

const STATIC_HEADINGS = {
  overview: 'Project Overview',
  pullRequests: 'Pull Requests',
  contributors: 'Contributors',
  delivery: 'Delivery',
  leverage: 'Copilot Leverage',
  copilotUsage: 'Copilot Usage Insights',
  settings: 'Settings',
  accessibility: 'Accessibility Statement',
  adminProjects: 'Manage Projects',
  onboarding: 'Onboard a Project',
  help: 'Help',
  cookies: 'Cookies',
  privacy: 'Privacy'
}

const NAV_HEADINGS = {
  repo: (nav) => shortRepoName(nav.repository ?? ''),
  repoCycle: (nav) =>
    `${shortRepoName(nav.repository ?? '')} · PR Coding Cycle Time`,
  pr: (nav) => `Pull Request #${nav.prNumber}`,
  contributor: (nav) => nav.contributor,
  ticket: (nav) => nav.ticket
}

/** The hero heading for a page. */
export function pageHeading(nav) {
  if (Object.hasOwn(NAV_HEADINGS, nav.level)) {
    return NAV_HEADINGS[nav.level](nav)
  }
  return STATIC_HEADINGS[nav.level]
}
