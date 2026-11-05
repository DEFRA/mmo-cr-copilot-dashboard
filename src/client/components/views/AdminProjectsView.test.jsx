import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
      .getByRole('heading', { name: 'Complexity model' })
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
    expect(within(projects).getByText('AI-native')).toBeInTheDocument()
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
      .getByRole('heading', { name: 'Add a project' })
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
