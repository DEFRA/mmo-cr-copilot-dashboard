import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AdminProjectsView,
  validateComplexityModel,
  validateProject
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

const VALID = {
  name: 'New Service',
  slug: 'NSVC',
  type: 'ai-adopted',
  adoption: { day: '1', month: '10', year: '2025' },
  jiraKeys: 'MMOCR, FES'
}

describe('#validateProject', () => {
  const NOW = new Date('2026-10-19T12:00:00Z')

  test('Should accept a valid project', () => {
    expect(validateProject(VALID, NOW)).toEqual({})
  })

  test.each([
    ['name', { name: ' ' }, 'Enter a project name'],
    ['name', { name: 'x'.repeat(81) }, /80 characters/],
    ['slug', { slug: 'crar' }, /capital letters/],
    ['slug', { slug: 'AB' }, /3 or 4/],
    ['slug', { slug: 'ABCDE' }, /3 or 4/],
    ['type', { type: '' }, 'Select the project type'],
    [
      'adoption',
      { adoption: { day: '', month: '', year: '' } },
      /adopted Copilot/
    ],
    [
      'adoption',
      { adoption: { day: '31', month: '2', year: '2025' } },
      /real date/
    ],
    ['adoption', { adoption: { day: '1', month: '1', year: '2027' } }, /past/],
    ['jiraKeys', { jiraKeys: 'mmocr' }, /capital letters/]
  ])('Should report %s for %o', (field, change, message) => {
    const errors = validateProject({ ...VALID, ...change }, NOW)
    expect(errors[field]).toMatch(message)
  })

  test('Should not require an adoption date for an AI-native project', () => {
    const form = {
      ...VALID,
      type: 'ai-native',
      adoption: { day: '', month: '', year: '' }
    }
    expect(validateProject(form, NOW)).toEqual({})
  })
})

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

  test('Should show an error summary linked to the fields', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const summary = screen.getByRole('alert')
    expect(
      within(summary).getByRole('link', { name: 'Enter a project name' })
    ).toHaveAttribute('href', '#project-name')
    expect(
      within(summary).getByRole('link', { name: 'Select the project type' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Project name')).toHaveAttribute(
      'aria-describedby',
      'project-name-error'
    )
  })

  test('Should check the answers, then add the project with the CSRF header', async () => {
    const user = userEvent.setup()
    renderView()
    await screen.findByRole('cell', { name: '1 October 2025' })

    await user.type(screen.getByLabelText('Project name'), 'New Service')
    await user.type(screen.getByLabelText(/^Project slug/), 'NSVC')
    await user.click(screen.getByLabelText('AI-adopted'))
    await user.type(screen.getByLabelText('Day'), '1')
    await user.type(screen.getByLabelText('Month'), '10')
    await user.type(screen.getByLabelText('Year'), '2025')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      screen.getByRole('heading', { name: 'Check the project details' })
    ).toBeInTheDocument()
    expect(screen.getByText('NSVC')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Change project name' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add project' }))

    await waitFor(() =>
      expect(screen.getByText('Project New Service added.')).toBeInTheDocument()
    )
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST'
    )
    expect(post[1].headers['x-requested-with']).toBe('XMLHttpRequest')
    expect(JSON.parse(post[1].body)).toEqual({
      name: 'New Service',
      slug: 'NSVC',
      type: 'ai-adopted',
      adoptionStartDate: '2025-10-01T00:00:00.000Z',
      jira: { projectKeys: [] }
    })
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
