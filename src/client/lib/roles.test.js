import { ROLES, ROLE_LABEL, canAdministerProject } from './roles.js'

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
})
