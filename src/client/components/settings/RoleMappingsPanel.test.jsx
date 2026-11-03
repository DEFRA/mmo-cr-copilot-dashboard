import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { RoleMappingsPanel } from './RoleMappingsPanel'

const MAPPINGS = [
  {
    id: 'a'.repeat(24),
    groupName: 'AG-Admins',
    role: 'Dashboard.Admin',
    projectSlug: null
  },
  {
    id: 'b'.repeat(24),
    groupName: 'AG-CRAR-Readers',
    role: 'project-user',
    projectSlug: 'CRAR'
  }
]
const PROJECTS = [{ slug: 'CRAR', name: 'Catch Recording' }]

const serve = (mappings = MAPPINGS, write = { status: 201, body: '{}' }) =>
  fetchMock.mockResponse(async (req) =>
    req.method === 'GET' ? JSON.stringify({ roleMappings: mappings }) : write
  )

const writes = () =>
  fetchMock.mock.calls.filter(
    ([, init]) => init?.method !== undefined && init.method !== 'GET'
  )

const renderPanel = () => render(<RoleMappingsPanel projects={PROJECTS} />)

describe('#RoleMappingsPanel', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
  })

  test('Should show a loading state first', () => {
    fetchMock.mockResponse(() => new Promise(() => {}))
    renderPanel()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading Role Mappings'
    )
  })

  test('Should list the mappings in a captioned table', async () => {
    serve()
    renderPanel()

    const table = await screen.findByRole('table', { name: 'Role mappings' })
    expect(within(table).getByText('AG-CRAR-Readers')).toBeVisible()
    expect(within(table).getByText('Project User')).toBeVisible()
    expect(within(table).getByText('All Projects')).toBeVisible()
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4)
  })

  test('Should say when nothing is mapped', async () => {
    serve([])
    renderPanel()

    expect(await screen.findByText('No Mappings')).toBeVisible()
  })

  test('Should show an error state without internal detail', async () => {
    fetchMock.mockResponse('{}', { status: 502 })
    renderPanel()

    expect(
      await screen.findByText(/could not load the role mappings/)
    ).toBeVisible()
  })

  test('Should warn that group display names are mutable', async () => {
    serve()
    renderPanel()

    await screen.findByRole('table')
    expect(screen.getByLabelText('Group Name')).toHaveAccessibleDescription(
      /can be changed or reused/
    )
  })

  test('Should add a project mapping with the CSRF header', async () => {
    const user = userEvent.setup()
    serve()
    renderPanel()
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Group Name'), ' AG-New ')
    await user.click(screen.getByLabelText('Project User'))
    await user.selectOptions(screen.getByLabelText('Project'), 'CRAR')
    await user.click(screen.getByRole('button', { name: 'Add Mapping' }))

    expect(await screen.findByText('Mapping for AG-New added')).toBeVisible()
    const [url, init] = writes()[0]
    expect(url).toBe('/api/role-mappings')
    expect(init.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(init.body)).toEqual({
      groupName: 'AG-New',
      role: 'project-user',
      projectSlug: 'CRAR'
    })
  })

  test('Should hide the project field for a Dashboard Admin mapping', async () => {
    const user = userEvent.setup()
    serve()
    renderPanel()
    await screen.findByRole('table')

    expect(screen.queryByLabelText('Project')).toBeNull()
    await user.click(screen.getByLabelText('Dashboard Admin'))
    expect(screen.queryByLabelText('Project')).toBeNull()
    await user.click(screen.getByLabelText('Project Admin'))
    expect(screen.getByLabelText('Project')).toBeVisible()
  })

  test('Should list problems in an error summary and not send', async () => {
    const user = userEvent.setup()
    serve()
    renderPanel()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Add Mapping' }))

    const summary = screen.getByRole('alert')
    expect(within(summary).getByText('Enter a group name')).toBeVisible()
    expect(within(summary).getByText('Select a role')).toBeVisible()
    expect(writes()).toHaveLength(0)
  })

  test('Should explain a duplicate mapping', async () => {
    const user = userEvent.setup()
    serve(MAPPINGS, {
      status: 409,
      body: JSON.stringify({ message: 'Conflict' })
    })
    renderPanel()
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Group Name'), 'AG-Admins')
    await user.click(screen.getByLabelText('Dashboard Admin'))
    await user.click(screen.getByRole('button', { name: 'Add Mapping' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/)
  })

  test('Should confirm before removing a mapping', async () => {
    const user = userEvent.setup()
    serve(MAPPINGS, { status: 200, body: '{}' })
    renderPanel()
    await screen.findByRole('table')

    await user.click(
      screen.getByRole('button', {
        name: /Remove\s?mapping for AG-CRAR-Readers/
      })
    )
    const heading = screen.getByRole('heading', { name: /Are you sure/ })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(writes()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Remove mapping' }))

    expect(
      await screen.findByText('Mapping for AG-CRAR-Readers removed')
    ).toBeVisible()
    expect(writes()[0][0]).toBe(`/api/role-mappings/${'b'.repeat(24)}`)
    expect(writes()[0][1].method).toBe('DELETE')
  })

  test('Should not remove the last Dashboard Admin mapping', async () => {
    const user = userEvent.setup()
    serve()
    renderPanel()
    await screen.findByRole('table')

    const last = screen.getByRole('button', {
      name: /Remove\s?mapping for AG-Admins/
    })
    expect(last).toHaveAttribute('aria-disabled', 'true')
    await user.click(last)

    expect(screen.queryByRole('heading', { name: /Are you sure/ })).toBeNull()
  })

  test('Should have no accessibility violations', async () => {
    serve()
    const { container } = renderPanel()
    await screen.findByRole('table')

    expect(await axeViolations(container)).toEqual([])
  })
})
