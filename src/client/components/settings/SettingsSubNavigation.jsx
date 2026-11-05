import { isPlainClick } from '../govuk/utils.js'
import { SETTINGS_TABS, toHash } from '../../lib/routes'

const TAB_LABEL = {
  personas: 'Persona Mappings',
  repositories: 'Repositories',
  roles: 'Role Mappings',
  'audit-log': 'Audit Log'
}

/**
 * The settings sections a caller may open: admins manage personas and
 * repositories, only dashboard admins manage roles, and everyone reads the
 * audit log.
 */
export function settingsTabsFor({ canAdminister, isDashboardAdmin }) {
  const allowed = {
    personas: canAdminister,
    repositories: canAdminister,
    roles: isDashboardAdmin,
    'audit-log': true
  }
  return SETTINGS_TABS.filter((id) => allowed[id]).map((id) => ({
    id,
    label: TAB_LABEL[id]
  }))
}

/** MOJ sub navigation between the settings sections the caller may open. */
export function SettingsSubNavigation({
  canAdminister,
  isDashboardAdmin,
  activeTab,
  onNavigate
}) {
  const tabs = settingsTabsFor({ canAdminister, isDashboardAdmin })

  return (
    <nav className="moj-sub-navigation" aria-label="Settings sections">
      <ul className="moj-sub-navigation__list">
        {tabs.map((tab) => (
          <li key={tab.id} className="moj-sub-navigation__item">
            <a
              className="moj-sub-navigation__link"
              href={toHash({ level: 'settings', tab: tab.id })}
              aria-current={tab.id === activeTab ? 'page' : undefined}
              onClick={(event) => {
                if (!onNavigate || !isPlainClick(event)) return
                event.preventDefault()
                onNavigate(tab.id)
              }}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
