/** The caller's role on a project, as resolved by the backend. */
export const ROLES = {
  user: 'project-user',
  admin: 'project-admin',
  dashboardAdmin: 'dashboard-admin'
}

export const ROLE_LABEL = {
  [ROLES.user]: 'Project user',
  [ROLES.admin]: 'Project admin',
  [ROLES.dashboardAdmin]: 'Dashboard admin'
}

/** Text and GOV.UK tag colour for each role. */
export const ROLE_TAG = {
  [ROLES.dashboardAdmin]: { text: 'Dashboard Admin', colour: 'magenta' },
  [ROLES.admin]: { text: 'Project Admin', colour: 'teal' },
  [ROLES.user]: { text: 'Project User', colour: 'grey' }
}

/** Project admins and dashboard admins may change a project's settings. */
export const canAdministerProject = (role) =>
  role === ROLES.admin || role === ROLES.dashboardAdmin

/** A dashboard admin outranks whatever role the project grants. */
export const effectiveRole = (role, isDashboardAdmin = false) =>
  isDashboardAdmin ? ROLES.dashboardAdmin : role
