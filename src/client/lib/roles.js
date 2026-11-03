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

/** Project admins and dashboard admins may change a project's settings. */
export const canAdministerProject = (role) =>
  role === ROLES.admin || role === ROLES.dashboardAdmin
