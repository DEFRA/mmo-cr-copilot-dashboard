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
      name: 'Connected repositories'
    })
    expect(mine).toHaveTextContent('DEFRA/mine')
    expect(mine).toHaveTextContent('DEFRA_mine')
    expect(mine).not.toHaveTextContent('DEFRA/theirs')
    expect(
      screen.getByRole('table', { name: 'Discovered repositories' })
    ).toHaveTextContent('DEFRA/loose')
  })

  test('Should give each group of repositories its own section', () => {
    renderPanel({ role: 'dashboard-admin' })

    for (const name of [
      'Connected Repositories',
      'Add a Repository',
      'Discovered Repositories',
      'Repos Mapped'
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('region')).toHaveLength(4)
    expect(
      screen.getByText(
        'Repositories sending telemetry that have not yet been assigned to a project.'
      )
    ).toBeVisible()
    expect(
      screen.getByText('Repositories currently assigned to other projects.')
    ).toBeVisible()
    expect(screen.queryByText(/Sending data, but not in a project/)).toBeNull()
    expect(screen.queryByText('In other projects')).toBeNull()
  })

  test('Should omit the discovered section when nothing is unassigned', () => {
    renderPanel({ unassigned: [] })

    expect(
      screen.queryByRole('region', { name: 'Discovered Repositories' })
    ).toBeNull()
  })

  test('Should hide other projects’ repositories from a project admin', () => {
    renderPanel()

    expect(
      screen.queryByRole('table', {
        name: 'Repositories mapped to other projects'
      })
    ).toBeNull()
    expect(screen.queryByRole('region', { name: 'Repos Mapped' })).toBeNull()
    expect(screen.queryByText('DEFRA/theirs')).toBeNull()
  })

  test('Should let a dashboard admin move a repository here', async () => {
    renderPanel({ role: 'dashboard-admin' })

    const others = screen.getByRole('table', {
      name: 'Repositories mapped to other projects'
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
      screen.getByLabelText('Repository name'),
      'DEFRA/new-repo'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add repository' })
    )

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(lastCall().url).toBe('/api/repositories/DEFRA%2Fnew-repo')
  })

  test('Should add a repository chosen from the suggestions', async () => {
    renderPanel()

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Repository name' })
    )
    await userEvent.click(screen.getByRole('option', { name: 'DEFRA/loose' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(lastCall().url).toBe('/api/repositories/DEFRA%2Floose')
    expect(lastCall().body).toEqual({ projectSlug: 'alpha' })
  })

  test('Should add a typed repository with Enter', async () => {
    renderPanel()

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Repository name' }),
      'DEFRA/typed{Enter}'
    )

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(lastCall().url).toBe('/api/repositories/DEFRA%2Ftyped')
  })

  test('Should refuse typed text that is not owner/name when Enter is pressed', async () => {
    renderPanel()

    await userEvent.type(
      screen.getByRole('combobox', { name: 'Repository name' }),
      'just-a-name{Enter}'
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/owner\/name/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should offer only unassigned owner/name repositories as suggestions', async () => {
    renderPanel({
      unassigned: ['DEFRA/loose', 'not-a-repo', 'DEFRA/another']
    })

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Repository name' })
    )

    expect(
      screen.getAllByRole('option').map((option) => option.textContent)
    ).toEqual(['DEFRA/loose', 'DEFRA/another'])
  })

  test('Should offer no suggestions when nothing is unassigned', async () => {
    renderPanel({ unassigned: [] })

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Repository name' })
    )

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  test('Should refuse a repository already in this project', async () => {
    renderPanel()

    await userEvent.type(screen.getByLabelText('Repository name'), 'defra/MINE')
    await userEvent.click(
      screen.getByRole('button', { name: 'Add repository' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'defra/MINE is already in this project'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should refuse a repository mapped elsewhere without naming the project', async () => {
    renderPanel()

    await userEvent.type(
      screen.getByLabelText('Repository name'),
      'DEFRA/theirs'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add repository' })
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'DEFRA/theirs is already mapped to a project'
    )
    expect(alert).not.toHaveTextContent('beta')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should point a dashboard admin to Move here for a repository elsewhere', async () => {
    renderPanel({ role: 'dashboard-admin' })

    await userEvent.type(
      screen.getByLabelText('Repository name'),
      'DEFRA/theirs'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add repository' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'DEFRA/theirs is in another project. Use Move here'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Should refuse a repository that is not owner/name', async () => {
    renderPanel()

    await userEvent.type(
      screen.getByLabelText('Repository name'),
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

  test('Should say the user lacks permission when a move is refused', async () => {
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
      'You do not have permission to do this'
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

  describe('Searching', () => {
    const many = (prefix, count, projectSlug) =>
      Array.from({ length: count }, (_, i) => ({
        fullName: `DEFRA/${prefix}-${i}`,
        projectSlug,
        sonarProjectKey: `KEY_${prefix}_${i}`
      }))

    test('Should offer no search on a short list of connected repositories', () => {
      renderPanel()

      expect(screen.queryByLabelText(/^Search connected/)).toBeNull()
      expect(screen.queryByLabelText(/^Search discovered/)).toBeNull()
    })

    test('Should filter a long list of connected repositories', async () => {
      renderPanel({ repositories: many('mine', 6, 'alpha') })

      const search = screen.getByLabelText('Search connected repositories')
      expect(search).toHaveAttribute('type', 'search')
      const table = screen.getByRole('table', {
        name: 'Connected repositories'
      })
      expect(within(table).getAllByRole('row')).toHaveLength(7)

      await userEvent.type(search, 'mine-3')

      expect(within(table).getAllByRole('row')).toHaveLength(2)
      expect(table).toHaveTextContent('DEFRA/mine-3')
      expect(
        screen.getByText('Showing 1 of 6 connected repositories')
      ).toHaveAttribute('role', 'status')
    })

    test('Should match a connected repository by its Sonar key', async () => {
      renderPanel({ repositories: many('mine', 6, 'alpha') })

      await userEvent.type(
        screen.getByLabelText('Search connected repositories'),
        'key_mine_5'
      )

      expect(
        screen.getByRole('table', { name: 'Connected repositories' })
      ).toHaveTextContent('DEFRA/mine-5')
    })

    test('Should say when nothing matches and keep the search box', async () => {
      renderPanel({ repositories: many('mine', 6, 'alpha') })

      await userEvent.type(
        screen.getByLabelText('Search connected repositories'),
        'zzz'
      )

      expect(
        screen.queryByRole('table', { name: 'Connected repositories' })
      ).toBeNull()
      expect(
        screen.getByText('No connected repositories match “zzz”')
      ).toHaveAttribute('role', 'status')
      expect(
        screen.getByLabelText('Search connected repositories')
      ).toBeVisible()
    })

    test('Should filter a long list of discovered repositories', async () => {
      renderPanel({
        unassigned: Array.from({ length: 7 }, (_, i) => `DEFRA/loose-${i}`)
      })

      await userEvent.type(
        screen.getByLabelText('Search discovered repositories'),
        'loose-6'
      )

      const table = screen.getByRole('table', {
        name: 'Discovered repositories'
      })
      expect(within(table).getAllByRole('row')).toHaveLength(2)
      await userEvent.click(
        within(table).getByRole('button', { name: /Add\s?DEFRA\/loose-6/ })
      )
      await waitFor(() => expect(onChanged).toHaveBeenCalled())
      expect(lastCall().url).toBe('/api/repositories/DEFRA%2Floose-6')
    })

    test('Should always offer a dashboard admin a search of the mapped repositories', async () => {
      renderPanel({ role: 'dashboard-admin' })

      const search = screen.getByLabelText('Search mapped repositories')
      const table = screen.getByRole('table', {
        name: 'Repositories mapped to other projects'
      })

      await userEvent.type(search, 'BETA')
      expect(table).toHaveTextContent('DEFRA/theirs')

      await userEvent.clear(search)
      await userEvent.type(search, 'nothing')
      expect(
        screen.queryByRole('table', {
          name: 'Repositories mapped to other projects'
        })
      ).toBeNull()
    })

    test('Should ignore a blank search', async () => {
      renderPanel({ repositories: many('mine', 6, 'alpha') })

      await userEvent.type(
        screen.getByLabelText('Search connected repositories'),
        '   '
      )

      expect(
        within(
          screen.getByRole('table', { name: 'Connected repositories' })
        ).getAllByRole('row')
      ).toHaveLength(7)
    })

    test('Should have no detectable accessibility violations while filtering', async () => {
      const { container } = renderPanel({
        role: 'dashboard-admin',
        repositories: [
          ...many('mine', 6, 'alpha'),
          ...many('theirs', 2, 'beta')
        ]
      })
      await userEvent.type(
        screen.getByLabelText('Search connected repositories'),
        'mine-1'
      )

      expect(await axeViolations(container)).toStrictEqual([])
    })
  })

  describe('SonarCloud project key', () => {
    const NO_KEY = [{ fullName: 'DEFRA/bare', projectSlug: 'alpha' }]
    const editButton = (name) =>
      screen.getByRole('button', {
        name: new RegExp(`^${name}\\s*SonarCloud project key for`)
      })
    const keyInput = () =>
      screen.getByRole('textbox', { name: 'SonarCloud project key' })

    test('Should not offer key editing to a project user', () => {
      renderPanel({ role: 'project-user' })

      expect(
        screen.queryByRole('button', { name: /SonarCloud project key/ })
      ).toBeNull()
    })

    test('Should save a changed key, trimmed, and return focus', async () => {
      renderPanel()

      await userEvent.click(editButton('Change'))
      expect(keyInput()).toHaveFocus()
      expect(keyInput()).toHaveValue('DEFRA_mine')
      await userEvent.clear(keyInput())
      await userEvent.type(keyInput(), '  DEFRA_mine-2  ')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      const { url, init, body } = lastCall()
      expect(url).toBe('/api/repositories/DEFRA%2Fmine/sonar-key')
      expect(init.method).toBe('PUT')
      expect(body).toEqual({ sonarProjectKey: 'DEFRA_mine-2' })
      expect(
        await screen.findByText('SonarCloud project key for DEFRA/mine saved')
      ).toBeInTheDocument()
      expect(onChanged).toHaveBeenCalled()
      await waitFor(() => expect(editButton('Change')).toHaveFocus())
    })

    test('Should remove a set key', async () => {
      renderPanel()

      await userEvent.click(editButton('Change'))
      await userEvent.click(screen.getByRole('button', { name: 'Remove key' }))

      expect(lastCall().body).toEqual({ sonarProjectKey: null })
      expect(
        await screen.findByText(
          'SonarCloud project key removed from DEFRA/mine'
        )
      ).toBeInTheDocument()
    })

    test('Should clear a set key when saved blank', async () => {
      renderPanel()

      await userEvent.click(editButton('Change'))
      await userEvent.clear(keyInput())
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(lastCall().body).toEqual({ sonarProjectKey: null })
    })

    test.each([
      ['', 'Enter a SonarCloud project key'],
      [
        'bad key',
        'SonarCloud project key must only contain letters, numbers, dots, colons, hyphens and underscores'
      ],
      [
        'k'.repeat(256),
        'SonarCloud project key must be 255 characters or fewer'
      ]
    ])('Should refuse %j without calling the backend', async (key, message) => {
      renderPanel({ repositories: NO_KEY })

      await userEvent.click(editButton('Add'))
      if (key) {
        await userEvent.click(keyInput())
        await userEvent.paste(key)
      }
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(fetchMock).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(
        screen.queryByRole('button', { name: 'Remove key' })
      ).not.toBeInTheDocument()
    })

    test.each([
      [403, 'You do not have permission to do this'],
      [404, 'DEFRA/mine is no longer connected to a project'],
      [500, 'The SonarCloud project key could not be saved. Try again later.']
    ])('Should explain a %i refusal', async (status, message) => {
      fetchMock.mockResponse('{}', { status })
      renderPanel()

      await userEvent.click(editButton('Change'))
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(keyInput()).toBeInTheDocument()
    })

    test('Should show a duplicate key inline on the key input', async () => {
      fetchMock.mockResponse(
        JSON.stringify({
          statusCode: 409,
          error: 'Conflict',
          message: 'That SonarCloud project key is already in use'
        }),
        { status: 409 }
      )
      const { container } = renderPanel()

      await userEvent.click(editButton('Change'))
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      const message = 'That SonarCloud project key is already in use.'
      const summary = await screen.findByRole('alert')
      expect(summary).toHaveTextContent(message)
      expect(summary).not.toHaveTextContent(/repositor/i)
      expect(
        within(summary).getByRole('link', { name: message })
      ).toHaveAttribute('href', `#${keyInput().id}`)
      expect(keyInput()).toHaveAccessibleDescription(
        expect.stringContaining(message)
      )
      expect(await axeViolations(container)).toStrictEqual([])
    })

    test('Should explain a network failure', async () => {
      fetchMock.mockReject(new Error('offline'))
      renderPanel()

      await userEvent.click(editButton('Change'))
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The SonarCloud project key could not be saved. Try again later.'
      )
    })

    test('Should cancel an edit and return focus', async () => {
      renderPanel()

      await userEvent.click(editButton('Change'))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(
        screen.queryByRole('textbox', { name: 'SonarCloud project key' })
      ).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
      await waitFor(() => expect(editButton('Change')).toHaveFocus())
    })
  })

  test('Should have no detectable accessibility violations', async () => {
    const { container } = renderPanel({ role: 'dashboard-admin' })

    expect(await axeViolations(container)).toStrictEqual([])
  })
})
