import { toHash } from '../../lib/routes.js'
import { shortRepoName } from '../../lib/selectors.js'
import { Breadcrumbs } from '../govuk/Breadcrumbs.jsx'

const LIST_LABELS = {
  pullRequests: 'Pull requests',
  contributors: 'Contributors',
  delivery: 'Delivery',
  leverage: 'Copilot Leverage',
  copilotUsage: 'Copilot usage insights'
}

const link = (id, label, nav) => ({ id, label, href: toHash(nav), nav })

/**
 * Breadcrumb items for the cascade Project › Repository › Pull request. The
 * project overview and service-wide pages have none.
 */
export function cascadeItems(nav, projectName) {
  const scope = nav.project ? { project: nav.project } : {}
  const project = link('project', projectName, { level: 'overview', ...scope })
  const repository =
    nav.repository &&
    link(`repo:${nav.repository}`, shortRepoName(nav.repository), {
      level: 'repo',
      repository: nav.repository,
      ...scope
    })

  switch (nav.level) {
    case 'repo':
      return [project, repository]
    case 'repoCycle':
      return [
        project,
        repository,
        { id: 'cycle', label: 'PR coding cycle time' }
      ]
    case 'pr':
      return [
        project,
        repository,
        { id: 'pr', label: `Pull request ${nav.prNumber}` }
      ]
    case 'contributor':
      return [
        project,
        ...(repository ? [repository] : []),
        { id: 'contributor', label: nav.contributor }
      ]
    case 'ticket':
      return [
        project,
        link('delivery', LIST_LABELS.delivery, { level: 'delivery', ...scope }),
        { id: 'ticket', label: nav.ticket }
      ]
    default:
      return LIST_LABELS[nav.level]
        ? [project, { id: nav.level, label: LIST_LABELS[nav.level] }]
        : []
  }
}

export function CascadeBreadcrumbs({ nav, projectName, onNavigate }) {
  const items = cascadeItems(nav, projectName)
  if (items.length === 0) {
    return null
  }

  return (
    <Breadcrumbs
      items={items}
      onNavigate={(item) => onNavigate(item.nav)}
      collapseOnMobile
    />
  )
}
