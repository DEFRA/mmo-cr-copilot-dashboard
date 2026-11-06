import { renderHook, waitFor } from '@testing-library/react'

import { useCurrentUser } from './useCurrentUser'

const ME = {
  authenticated: true,
  oid: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  roles: ['Dashboard.Admin'],
  projectRoles: { CRAR: 'project-admin', FES: 'project-user' },
  allowedProjects: ['CRAR', 'FES']
}

describe('#useCurrentUser', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
  })

  const load = async (body, init) => {
    fetchMock.mockResponseOnce(JSON.stringify(body), init)
    const hook = renderHook(() => useCurrentUser())
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    return hook.result.current
  }

  test('Should expose roles, project roles and allowed projects', async () => {
    const current = await load(ME)

    expect(current.user.name).toBe('Ada')
    expect(current.isAdmin).toBe(true)
    expect(current.roles).toEqual(['Dashboard.Admin'])
    expect(current.allowedProjects).toEqual(['CRAR', 'FES'])
    expect(current.roleFor('FES')).toBe('project-user')
    expect(current.roleFor('NOPE')).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
  })

  test('Should let only an admin or that project’s admin administer it', async () => {
    const admin = await load({ ...ME, roles: [] })

    expect(admin.isAdmin).toBe(false)
    expect(admin.canAdministerProject('CRAR')).toBe(true)
    expect(admin.canAdministerProject('FES')).toBe(false)
  })

  test('Should drop project roles it does not recognise', async () => {
    const current = await load({
      ...ME,
      projectRoles: { CRAR: 'root', FES: 'project-user' },
      roles: 'Dashboard.Admin'
    })

    expect(current.projectRoles).toEqual({ FES: 'project-user' })
    expect(current.isAdmin).toBe(false)
  })

  test('Should be anonymous when the session says so', async () => {
    const current = await load({ authenticated: false })

    expect(current.user).toBeNull()
    expect(current.isAdmin).toBe(false)
  })

  test('Should stay anonymous when the session request fails', async () => {
    fetchMock.mockRejectOnce(new Error('offline'))
    const { result } = renderHook(() => useCurrentUser())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.user).toBeNull()
  })
})
