import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import { RepositoryMappingPanel } from './RepositoryMappingPanel'

const PROJECT = { slug: 'alpha', name: 'Alpha' }
const REPOSITORIES = [
  {
    fullName: 'DEFRA/mine',
    projectSlug: 'alpha',
    sonarProjectKey: 'DEFRA_mine'
  },
  { fullName: 'DEFRA/theirs', projectSlug: 'beta' }
]

describe('#RepositoryMappingPanel', () => {
  const onChanged = vi.fn()

  beforeEach(() => {
    fetchMock.mockResponse('{}')
  })

  const renderPanel = (props = {}) =>
    render(
      <RepositoryMappingPanel
        project={PROJECT}
        role="project-admin"
        repositories={REPOSITORIES}
        unassigned={['DEFRA/loose']}
        status="success"
        onChanged={onChanged}
        {...props}
      />
    )

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)
    return { url, init, body: init.body ? JSON.parse(init.body) : undefined }
  }

  test('Should list only this project’s repositories and the unassigned ones', () => {
    renderPanel()

    const mine = screen.getByRole('table', {
      name: 'Repositories in this project'
    })
    expect(mine).toHaveTextContent('DEFRA/mine')
    expect(mine).toHaveTextContent('DEFRA_mine')
    expect(mine).not.toHaveTextContent('DEFRA/theirs')
    expect(
      screen.getByRole('table', {
        name: 'Repositories sending data that no project owns'
      })
    ).toHaveTextContent('DEFRA/loose')
  })

  test('Should hide other projects’ repositories from a project admin', () => {
    renderPanel()

    expect(
      screen.queryByRole('table', { name: 'Repositories in other projects' })
    ).toBeNull()
    expect(screen.queryByText('DEFRA/theirs')).toBeNull()
  })

  test('Should let a dashboard admin move a repository here', async () => {
    renderPanel({ role: 'dashboard-admin' })

    const others = screen.getByRole('table', {
      name: 'Repositories in other projects'
    })
    await userEvent.click(
      within(others).getByRole('button', { name: /Move here/ })
    )

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const { url, init, body } = lastCall()
    expect(url).toBe('/api/repositories/DEFRA%2Ftheirs')
    expect(init.method).toBe('PUT')
    expect(init.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(body).toEqual({ projectSlug: 'alpha' })
    expect(
      await screen.findByText('DEFRA/theirs moved to this project')
    ).toBeVisible()
  })

  test('Should add an unassigned repository in one click', async () => {
    renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: /Add\s?DEFRA\/loose to this project/ })
    )

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(lastCall().url).toBe('/api/repositories/DEFRA%2Floose')
    expect(lastCall().body).toEqual({ projectSlug: 'alpha' })
  })

  test('Should add a typed repository', async () => {
    renderPanel()

    await userEvent.type(
      screen.getByLabelText('Add a repository'),
      'DEFRA/new-repo'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add repository' })
    )

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(lastCall().url).toBe('/api/repositories/DEFRA%2Fnew-repo')
  })

  test('Should refuse a repository that is not owner/name', async () => {
    renderPanel()

    await userEvent.type(
      screen.getByLabelText('Add a repository'),
      'just-a-name'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add repository' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/owner\/name/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should ask for confirmation before removing, and cancel cleanly', async () => {
    renderPanel()

    await userEvent.click(
      screen.getByRole('button', {
        name: /Remove\s?DEFRA\/mine from this project/
      })
    )
    expect(fetchMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Confirm remove' })).toBeNull()
  })

  test('Should remove a repository once confirmed', async () => {
    fetchMock.mockResponse(null, { status: 204 })
    renderPanel()

    await userEvent.click(
      screen.getByRole('button', {
        name: /Remove\s?DEFRA\/mine from this project/
      })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm remove' })
    )

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const { url, init } = lastCall()
    expect(url).toBe('/api/repositories/DEFRA%2Fmine')
    expect(init.method).toBe('DELETE')
  })

  test('Should show the backend’s reason when a move is refused', async () => {
    fetchMock.mockResponse(
      JSON.stringify({
        message: 'Moving a repository needs a dashboard admin'
      }),
      { status: 403 }
    )
    renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: /Add\s?DEFRA\/loose to this project/ })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Moving a repository needs a dashboard admin'
    )
    expect(onChanged).not.toHaveBeenCalled()
  })

  test('Should show a load error', () => {
    renderPanel({ repositories: [], unassigned: [], status: 'error' })

    expect(screen.getByText(/We could not load the repositories/)).toBeVisible()
  })

  test('Should mark the panel busy while loading', () => {
    const { container } = renderPanel({
      repositories: [],
      unassigned: [],
      status: 'loading'
    })

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  test('Should say when the project has no repositories yet', () => {
    renderPanel({ repositories: [], unassigned: [] })

    expect(
      screen.getByText(/No repository sends data to this project yet/)
    ).toBeVisible()
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = renderPanel({ role: 'dashboard-admin' })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
