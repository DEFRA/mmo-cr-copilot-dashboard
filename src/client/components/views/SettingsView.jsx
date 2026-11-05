import { InsetText } from '../govuk'
import { AuditLogPanel } from '../AuditLogPanel'
import { PersonaMappingsSection } from '../settings/PersonaMappingsSection'
import { RepositoryMappingPanel } from '../settings/RepositoryMappingPanel'
import { RoleMappingsPanel } from '../settings/RoleMappingsPanel'
import { RoleTag } from '../settings/RoleTag'
import {
  SettingsSubNavigation,
  settingsTabsFor
} from '../settings/SettingsSubNavigation'
import { useRepositories } from '../../hooks/useRepositories'
import {
  ROLE_LABEL,
  canAdministerProject,
  effectiveRole
} from '../../lib/roles'

/**
 * Settings for the active project, one section at a time. Project admins
 * manage who counts as which delivery persona and which repositories feed the
 * project, dashboard admins also manage roles, and a project user sees only
 * the project's audit log.
 */
export function SettingsView({
  project,
  role,
  mappings,
  status,
  onSave,
  onRemove,
  projects = [],
  isDashboardAdmin = false,
  contributors = [],
  tab,
  onTabChange
}) {
  const resolvedRole = effectiveRole(role, isDashboardAdmin)
  const canAdminister = canAdministerProject(resolvedRole)
  const repos = useRepositories(canAdminister)
  const handleRepositoriesChanged = repos.refresh
  const tabs = settingsTabsFor({ canAdminister, isDashboardAdmin })
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id

  return (
    <>
      <div className="app-settings__head">
        <p className="govuk-body govuk-!-margin-bottom-0">
          Settings for <strong>{project?.name}</strong>
        </p>
        <RoleTag role={role} isDashboardAdmin={isDashboardAdmin} />
      </div>
      <SettingsSubNavigation
        canAdminister={canAdminister}
        isDashboardAdmin={isDashboardAdmin}
        activeTab={activeTab}
        onNavigate={onTabChange}
      />

      {!canAdminister && (
        <InsetText>
          You are a {(ROLE_LABEL[resolvedRole] ?? 'project user').toLowerCase()}{' '}
          on {project?.name}. You can read this project’s audit log. Changing
          settings needs a project admin.
        </InsetText>
      )}
      {activeTab === 'personas' && (
        <PersonaMappingsSection
          mappings={mappings}
          status={status}
          onSave={onSave}
          onRemove={onRemove}
          contributors={contributors}
        />
      )}
      {activeTab === 'repositories' && (
        <RepositoryMappingPanel
          project={project}
          role={resolvedRole}
          repositories={repos.repositories}
          unassigned={repos.unassigned}
          status={repos.status}
          onChanged={handleRepositoriesChanged}
        />
      )}
      {activeTab === 'roles' && <RoleMappingsPanel projects={projects} />}
      {activeTab === 'audit-log' && (
        <AuditLogPanel projectSlug={project?.slug} />
      )}
    </>
  )
}
