import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { axeViolations } from '#/test-helpers/axe.js'
import {
  AdminProjectsView,
  validateComplexityModel
} from './AdminProjectsView.jsx'

const PROJECTS = [
  {
    name: 'MMO Catch Recording',
    slug: 'CRAR',
    type: 'ai-adopted',
    adoptionStartDate: '2025-10-01T00:00:00.000Z'
  },
  { name: 'FES AI Assistant', slug: 'FES', type: 'ai-native' }
]

describe('#validateComplexityModel', () => {
  const FIELDS = {
    lineCap: '400',
    fileCap: '25',
    moduleCap: '5',
    hardCapLines: '400',
    hardCapFiles: '50',
    lines: '0.5',
    files: '0.3',
    modules: '0.2'
  }

  test('Should accept a valid model and convert it to numbers', () => {
    const { errors, model } = validateComplexityModel(FIELDS)

    expect(errors).toEqual({})
    expect(model).toEqual({
      lineCap: 400,
      fileCap: 25,
      moduleCap: 5,
      hardCapLines: 400,
      hardCapFiles: 50,
      weights: { lines: 0.5, files: 0.3, modules: 0.2 }
    })
  })

  test.each([
    [{ lines: '0.6' }, 'lines', 'The three weights must add up to 1'],
    [{ files: '2' }, 'files', 'Files weight must be a number from 0 to 1'],
    [
      { lineCap: '0' },
      'lineCap',
      'Line cap must be a whole number of 1 or more'
    ],
    [
      { fileCap: '2.5' },
      'fileCap',
      'File cap must be a whole number of 1 or more'
    ]
  ])('Should reject %o', (change, field, message) => {
    expect(
      validateComplexityModel({ ...FIELDS, ...change }).errors[field]
    ).toBe(message)
  })
})

describe('#AdminProjectsView', () => {
  beforeEach(() => {
    fetchMock.mockResponse((req) => {
      if (req.method !== 'GET') return JSON.stringify({})
      if (req.url.includes('/api/repositories/unassigned')) {
        return JSON.stringify({ repositories: ['DEFRA/unassigned-repo'] })
      }
      if (req.url.includes('/api/repositories')) {
        return JSON.stringify({
          repositories: [
            { fullName: 'DEFRA/mmo-cr-copilot-backend', projectSlug: 'CRAR' }
          ]
        })
      }
      return JSON.stringify({ projects: PROJECTS })
    })
  })

  const renderView = () =>
    render(<AdminProjectsView onNavigateHome={vi.fn()} />)

  test('Should save a complexity model and report the new version', async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes('/complexity-model')) {
        return JSON.stringify(
          req.method === 'PUT'
            ? { version: 3 }
            : {
                lineCap: 400,
                fileCap: 25,
                moduleCap: 5,
                hardCapLines: 400,
                hardCapFiles: 50,
                weights: { lines: 0.5, files: 0.3, modules: 0.2 },
                version: 2
              }
        )
      }
      if (req.url.includes('/api/repositories')) {
        return JSON.stringify({ repositories: [] })
      }
      return JSON.stringify({ projects: PROJECTS })
    })
    const user = userEvent.setup()
    renderView()

    const section = screen
      .getByRole('heading', { name: 'Complexity Model' })
      .closest('section')
    await within(section).findByRole('option', { name: 'MMO Catch Recording' })
    await user.selectOptions(
      within(section).getByLabelText('Project to configure'),
      'CRAR'
    )
    expect(await within(section).findByText('Current version: 2')).toBeVisible()
    await user.click(
      within(section).getByRole('button', { name: 'Save complexity model' })
    )

    expect(await screen.findByText(/saved as version 3/)).toBeInTheDocument()
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(put[0]).toBe('/api/projects/CRAR/complexity-model')
    expect(put[1].headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(put[1].body).weights).toEqual({
      lines: 0.5,
      files: 0.3,
      modules: 0.2
    })
  })

  test('Should recompute complexity and report the count', async () => {
    fetchMock.mockResponse((req) => {
      if (req.method === 'POST') return JSON.stringify({ updated: 12 })
      if (req.url.includes('/api/repositories')) {
        return JSON.stringify({ repositories: [] })
      }
      return JSON.stringify({ projects: PROJECTS })
    })
    const user = userEvent.setup()
    renderView()

    await user.click(
      screen.getByRole('button', { name: 'Recompute complexity' })
    )

    expect(
      await screen.findByText(/12 pull requests rescored/)
    ).toBeInTheDocument()
  })

  test('Should list the projects', async () => {
    renderView()

    const projects = await screen.findByRole('table', {
      name: 'Configured projects'
    })
    expect(
      await within(projects).findByText('MMO Catch Recording')
    ).toBeInTheDocument()
    expect(within(projects).getByText('1 October 2025')).toBeInTheDocument()
    expect(within(projects).getByText('AI-Native')).toBeInTheDocument()
    expect(within(projects).queryByText(/admin, .* user/)).toBeNull()
  })

  test('Should leave repository mapping to project admins in Settings', async () => {
    renderView()
    await screen.findByRole('table', { name: 'Configured projects' })

    expect(
      screen.queryByRole('button', { name: 'Map repository' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('table', { name: 'Mapped repositories' })
    ).not.toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/repositories')
      )
    ).toBe(false)
  })

  test('Should send project creation to the onboarding wizard', async () => {
    const user = userEvent.setup()
    const onOnboardProject = vi.fn()
    render(
      <AdminProjectsView
        onNavigateHome={vi.fn()}
        onOnboardProject={onOnboardProject}
      />
    )
    await screen.findByRole('table', { name: 'Configured projects' })

    const section = screen
      .getByRole('heading', { name: 'Add a Project' })
      .closest('section')
    const button = within(section).getByRole('button', {
      name: 'Onboard a project'
    })
    expect(button).toHaveAttribute('href', '#/onboarding')

    await user.click(button)

    expect(onOnboardProject).toHaveBeenCalledTimes(1)
  })

  test('Should leave a modified click on the onboarding link to the browser', async () => {
    const user = userEvent.setup()
    const onOnboardProject = vi.fn()
    render(
      <AdminProjectsView
        onNavigateHome={vi.fn()}
        onOnboardProject={onOnboardProject}
      />
    )
    await screen.findByRole('table', { name: 'Configured projects' })

    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('button', { name: 'Onboard a project' }))
    await user.keyboard('{/Shift}')

    expect(onOnboardProject).not.toHaveBeenCalled()
  })

  test('Should no longer show the inline project form', async () => {
    renderView()
    await screen.findByRole('table', { name: 'Configured projects' })

    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Project slug/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue' })
    ).not.toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')
    ).toBe(false)
  })

  test('Should no longer offer group editing', async () => {
    renderView()
    await screen.findByRole('table', { name: 'Configured projects' })

    expect(screen.queryByLabelText(/admin groups/i)).toBeNull()
    expect(screen.queryByLabelText(/user groups/i)).toBeNull()
    expect(screen.getByText(/Role Mappings under Settings/)).toBeVisible()
  })

  test('Should call onNavigateHome from the back link', async () => {
    const user = userEvent.setup()
    const onNavigateHome = vi.fn()
    render(<AdminProjectsView onNavigateHome={onNavigateHome} />)

    await user.click(screen.getByRole('link', { name: 'Back to overview' }))

    expect(onNavigateHome).toHaveBeenCalledTimes(1)
  })
})

describe('#AdminProjectsView Jira project key', () => {
  const KEYED = { projectKeys: ['MMOCR'] }
  const JIRA_PROJECTS = [
    { name: 'No Key Adopted', slug: 'NKA', type: 'ai-adopted' },
    {
      name: 'Keyed Adopted',
      slug: 'KEY',
      type: 'ai-adopted',
      jira: KEYED
    },
    {
      name: 'Native Project',
      slug: 'NAT',
      type: 'ai-native',
      jira: { projectKeys: ['FESAI'] }
    }
  ]

  const putOf = () =>
    fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')

  // `answer` replies to the PUT; a successful one adds the key to the list.
  const backend = (answer = () => JSON.stringify({})) => {
    let saved = false
    fetchMock.mockResponse((req) => {
      if (req.method === 'PUT') {
        const reply = answer(req)
        saved = !reply?.status
        return reply
      }
      const projects = saved
        ? JIRA_PROJECTS.map((p) =>
            p.slug === 'NKA' ? { ...p, jira: { projectKeys: ['MMOCR'] } } : p
          )
        : JIRA_PROJECTS
      return JSON.stringify({ projects })
    })
  }

  const refuse = (status, message) => () => ({
    status,
    body: JSON.stringify({ statusCode: status, error: 'Error', message })
  })

  async function openSection(slug, props = {}) {
    const user = userEvent.setup()
    const view = render(
      <AdminProjectsView onNavigateHome={vi.fn()} {...props} />
    )
    const section = screen
      .getByRole('heading', { name: 'Jira Project Key' })
      .closest('section')
    await within(section).findByRole('option', { name: 'No Key Adopted' })
    await user.selectOptions(
      within(section).getByLabelText('Project to change'),
      slug
    )
    return { user, section, ...view }
  }

  test.each([
    ['a project that has a key', 'KEY', 'MMOCR'],
    ['an AI-Native project', 'NAT', 'FESAI']
  ])('Should show the key of %s as read-only text', async (_, slug, key) => {
    backend()
    const { section, container } = await openSection(slug)

    expect(within(section).getByText(key)).toBeVisible()
    expect(
      within(section).getByText('The Jira project key cannot be changed.')
    ).toBeVisible()
    expect(within(section).queryByRole('textbox')).toBeNull()
    expect(
      within(section).queryByRole('button', { name: /Jira project key/ })
    ).toBeNull()
    expect(await axeViolations(container)).toStrictEqual([])
  })

  test('Should let a key-less AI-Adopted project add a key once', async () => {
    backend()
    const { user, section, container } = await openSection('NKA')

    const field = within(section).getByRole('textbox', {
      name: 'Jira project key'
    })
    expect(field).toHaveAccessibleDescription(
      'You can add a Jira project key once. It cannot be changed afterwards.'
    )
    expect(await axeViolations(container)).toStrictEqual([])

    await user.type(field, 'mmocr')
    await user.click(
      within(section).getByRole('button', { name: 'Add Jira project key' })
    )

    expect(
      await screen.findByText(/MMOCR added to No Key Adopted/)
    ).toBeVisible()
    const [url, init] = putOf()
    expect(url).toBe('/api/projects/NKA')
    expect(JSON.parse(init.body)).toStrictEqual({
      jira: { projectKeys: ['MMOCR'] }
    })
    expect(init.headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(await within(section).findByText('MMOCR')).toBeVisible()
    expect(within(section).queryByRole('textbox')).toBeNull()
  })

  test('Should tell the app to refresh its projects after a key is saved, and not when it is refused', async () => {
    backend()
    const onProjectsChanged = vi.fn()
    const { user, section } = await openSection('NKA', { onProjectsChanged })
    const add = () =>
      user.click(
        within(section).getByRole('button', { name: 'Add Jira project key' })
      )

    await user.type(
      within(section).getByRole('textbox', { name: 'Jira project key' }),
      'bad key'
    )
    await add()
    expect(onProjectsChanged).not.toHaveBeenCalled()

    await user.clear(
      within(section).getByRole('textbox', { name: 'Jira project key' })
    )
    await user.type(
      within(section).getByRole('textbox', { name: 'Jira project key' }),
      'mmocr'
    )
    await add()

    await waitFor(() => expect(onProjectsChanged).toHaveBeenCalledOnce())
  })

  test('Should show a backend Jira key message on the field and in the summary', async () => {
    backend(refuse(400, 'The Jira project key cannot be changed'))
    const { user, section, container } = await openSection('NKA')

    await user.type(
      within(section).getByRole('textbox', { name: 'Jira project key' }),
      'MMOCR'
    )
    await user.click(
      within(section).getByRole('button', { name: 'Add Jira project key' })
    )

    const summary = await screen.findByRole('alert')
    const link = within(summary).getByRole('link', {
      name: 'The Jira project key cannot be changed'
    })
    expect(link.getAttribute('href')).toMatch(/^#.+-key$/)
    expect(summary.closest('.govuk-error-summary')).toHaveFocus()
    expect(
      within(section).getByRole('textbox', { name: 'Jira project key' })
    ).toHaveAccessibleDescription(
      expect.stringContaining('Error: The Jira project key cannot be changed')
    )
    expect(await axeViolations(container)).toStrictEqual([])
  })

  test('Should refuse an invalid key without calling the backend', async () => {
    backend()
    const { user, section } = await openSection('NKA')

    await user.type(
      within(section).getByRole('textbox', { name: 'Jira project key' }),
      'a,b'
    )
    await user.click(
      within(section).getByRole('button', { name: 'Add Jira project key' })
    )

    expect(
      await within(screen.getByRole('alert')).findByRole('link', {
        name: 'Enter one Jira project key, with no commas or spaces, like MMOCR'
      })
    ).toBeVisible()
    expect(putOf()).toBeUndefined()
  })

  test('Should ask for a key when none is typed', async () => {
    backend()
    const { user, section } = await openSection('NKA')

    await user.click(
      within(section).getByRole('button', { name: 'Add Jira project key' })
    )

    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'Enter a Jira project key'
      })
    ).toBeVisible()
    expect(putOf()).toBeUndefined()
  })

  test.each([
    [403, 'Admin role required', 'You do not have permission to do this'],
    [404, 'Project not found', 'That project no longer exists'],
    [
      400,
      'Invalid request input',
      'Some of the information was not accepted. Check your answers and try again.'
    ]
  ])(
    'Should summarise a %i without marking the field',
    async (status, message, shown) => {
      backend(refuse(status, message))
      const { user, section } = await openSection('NKA')

      await user.type(
        within(section).getByRole('textbox', { name: 'Jira project key' }),
        'MMOCR'
      )
      await user.click(
        within(section).getByRole('button', { name: 'Add Jira project key' })
      )

      expect(
        await within(await screen.findByRole('alert')).findByText(shown)
      ).toBeVisible()
      expect(
        within(section).getByRole('textbox', { name: 'Jira project key' })
      ).not.toHaveAccessibleDescription(expect.stringContaining('Error:'))
    }
  )

  test('Should keep the existing message when the request fails', async () => {
    backend(() => {
      throw new Error('offline')
    })
    const { user, section } = await openSection('NKA')

    await user.type(
      within(section).getByRole('textbox', { name: 'Jira project key' }),
      'MMOCR'
    )
    await user.click(
      within(section).getByRole('button', { name: 'Add Jira project key' })
    )

    expect(
      await within(await screen.findByRole('alert')).findByText(
        'The Jira project key could not be saved'
      )
    ).toBeVisible()
  })

  test('Should show nothing to edit until a project is chosen', async () => {
    backend()
    render(<AdminProjectsView onNavigateHome={vi.fn()} />)
    const section = screen
      .getByRole('heading', { name: 'Jira Project Key' })
      .closest('section')

    expect(within(section).queryByRole('textbox')).toBeNull()
    expect(within(section).queryByText(/cannot be changed/)).toBeNull()
  })
})
