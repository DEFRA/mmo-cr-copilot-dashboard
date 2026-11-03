// Local sign-in personas. Only reachable with AUTH_DEV_BYPASS; the group names match the backend seed.
const DEV_USERS = {
  admin: {
    oid: 'dev-admin-oid',
    name: 'Dev Admin',
    email: 'dev-admin@example.com',
    groups: ['AG-Users-CopilotAnalytics-Dashboard-Admin'],
    roles: ['Dashboard.Admin']
  },
  'project-admin': {
    oid: 'dev-project-admin-oid',
    name: 'Dev Project Admin',
    email: 'dev-project-admin@example.com',
    groups: ['AG-Users-CopilotAnalytics-CRAR-Admin'],
    roles: []
  },
  user: {
    oid: 'dev-user-oid',
    name: 'Dev User',
    email: 'dev-user@example.com',
    groups: ['AG-Users-CopilotAnalytics-CRAR-Reader'],
    roles: []
  },
  nobody: {
    oid: 'dev-nobody-oid',
    name: 'Dev Nobody',
    email: 'dev-nobody@example.com',
    groups: [],
    roles: []
  }
}

export const DEV_TENANT_ID = 'dev-tenant'

/** The persona for a role key; an unknown key is the admin persona. */
export function devPersona(role, groups) {
  const persona = DEV_USERS[role] ?? DEV_USERS.admin
  return { ...persona, groups: groups ?? persona.groups }
}

/** The BFF-side session user for a persona; the backend resolves the real roles from the token. */
export function devSessionUser(persona) {
  return {
    oid: persona.oid,
    tid: DEV_TENANT_ID,
    name: persona.name,
    email: persona.email,
    roles: persona.roles,
    projectRoles: {},
    allowedProjects: []
  }
}

/** The backend accepts `dev-mock.<base64url claims>` only when its own bypass is on. */
export function devAccessToken(persona) {
  const claims = {
    oid: persona.oid,
    tid: DEV_TENANT_ID,
    name: persona.name,
    groups: persona.groups
  }
  return `dev-mock.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
}
