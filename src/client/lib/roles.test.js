import {
  ROLES,
  ROLE_LABEL,
  ROLE_TAG,
  canAdministerProject,
  effectiveRole
} from './roles.js'

describe('#roles', () => {
  test.each([
    [ROLES.dashboardAdmin, true],
    [ROLES.admin, true],
    [ROLES.user, false],
    [null, false],
    [undefined, false],
    ['something-else', false]
  ])('Should answer %s administering a project as %s', (role, expected) => {
    expect(canAdministerProject(role)).toBe(expected)
  })

  test('Should label every role', () => {
    expect(Object.values(ROLES).every((role) => ROLE_LABEL[role])).toBe(true)
  })

  test.each([
    [ROLES.dashboardAdmin, 'Dashboard Admin', 'magenta'],
    [ROLES.admin, 'Project Admin', 'teal'],
    [ROLES.user, 'Project User', 'grey']
  ])('Should tag %s as %s', (role, text, colour) => {
    expect(ROLE_TAG[role]).toStrictEqual({ text, colour })
  })

  test.each([
    [ROLES.user, false, ROLES.user],
    [ROLES.admin, false, ROLES.admin],
    [ROLES.user, true, ROLES.dashboardAdmin],
    [null, true, ROLES.dashboardAdmin],
    [undefined, false, undefined]
  ])(
    'Should resolve role %s with dashboard admin %s to %s',
    (role, isDashboardAdmin, expected) => {
      expect(effectiveRole(role, isDashboardAdmin)).toBe(expected)
    }
  )

  test('Should default to not being a dashboard admin', () => {
    expect(effectiveRole(ROLES.user)).toBe(ROLES.user)
  })
})
